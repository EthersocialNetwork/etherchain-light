let serverStartTime = new Date().toLocaleString();
let express = require('express');
let compression = require('compression');
let path = require('path');
let favicon = require('serve-favicon');
let logger = require('morgan');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
let waitUntil = require('wait-until');

let index = require('./routes/index');
let blocks = require('./routes/blocks');
let tx_recent = require('./routes/tx_recent');
let block = require('./routes/block');
let tx = require('./routes/tx');
let account = require('./routes/account');
let accounts = require('./routes/accounts');
let contract = require('./routes/contract');
let signature = require('./routes/signature');
let search = require('./routes/search');
let top100 = require('./routes/top100');
let peers = require('./routes/peers');
let redisblock = require('./routes/redisblock');
let hashratechart = require('./routes/hashratechart');
let bitzcharts = require('./routes/bitzcharts');
let api = require('./routes/api');
let prices = require('./routes/prices');

let api_proxy = require('./api/proxy');
let api_parity = require('./api/parity');
let api_account = require('./api/account');
let api_info = require('./api/info');

let test_batch = require('./routes/test_batch');

let config = new(require('./config/config.js'))();
let configERC20 = new(require('./config/configERC20.js'))();
let configConstant = require('./config/configConstant');

let level = require('level-rocksdb');
let db = level(configConstant.dbPath);

var Redis = require('ioredis');
var redis = new Redis(configConstant.redisConnectString);

let app = express();
app.use(compression({
  filter: shouldCompress
}));

let async = require('async');
let tokenExporterService = require('./services/tokenExporter.js');
let accountBalanceService = require('./services/accountBalanceService');
let blockStoreService = require('./services/blockStoreService');
let peerCollectorService = require('./services/peerCollectorService');
let priceService = require('./services/priceService');
let hashrateCollectorService = require('./services/hashrateCollectorService');

let contractAccountList = [];
let tokenExporter = {};

let cronServices = {};
async.waterfall([
  function (callback) {
    redis.hgetall('esn_contracts:eventslength', function (err, replies) {
      callback(null, replies);
    });
  },
  function (result, callback) {
    //console.dir(result);
    let sortable = [];
    for (let adr in result) {
      sortable.push([adr, result[adr]]);
    }
    sortable.sort(function (a, b) {
      return Number(a[1]) - Number(b[1]);
    });

    async.eachSeries(sortable, function (iter, forEachOfCallback) {
      var eventslength = iter[1],
        account = iter[0];
      contractAccountList.push(account);
      //console.log(account,"start", Date.now());

      redis.hget('ExportToken:createBlock:', account, function (err, result) {
        if (!result) {
          result = 1;
        }
        var now = new Date();
        tokenExporter[account] = new tokenExporterService(config.providerIpc, configERC20.erc20ABI, account, result, now.getTime());
        waitUntil()
          .interval(10)
          .times(100)
          .condition(function (cb) {
            process.nextTick(function () {
              cb(tokenExporter[account].isLoaded);
            });
          })
          .done(function (result) {
            sleep(10).then(() => {
              forEachOfCallback();
            });
          });
      });
    }, function (err) {
      if (err) {
        console.log("[ERROR] exporter listing: ", err);
        callback(err, null);
      } else {
        app.set('tokenExporter', tokenExporter);
        callback(null, contractAccountList);
      }
    });
  }
], function (err, accountList) {
  // view engine setup
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'pug');
  app.set('config', config);
  app.set('configERC20', configERC20);
  app.set('db', db);
  app.set('trust proxy', true);

  //APIs
  app.all('/api_proxy/*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
  });
  app.use('/api_proxy', api_proxy);

  app.all('/api_parity/*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
  });
  app.use('/api_parity', api_parity);

  app.all('/api_account/*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
  });
  app.use('/api_account', api_account);

  app.all('/api_info/*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
  });
  app.use('/api_info', api_info);

  // uncomment after placing your favicon in /public
  app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
  app.use(logger(configConstant.logFormat, {
    skip: function (req, res) {
      return res.statusCode == 304;
    }
  }));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({
    extended: false
  }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  app.locals.tokenformatter = new(require('./utils/tokenformatter.js'))();
  app.locals.moment = require('moment');
  app.locals.numeral = require('numeral');
  app.locals.ethformatter = require('./utils/ethformatter.js');
  app.locals.numberformatter = require('./utils/numberformatter.js');
  app.locals.nameformatter = new(require('./utils/nameformatter.js'))();
  app.locals.nodeStatus = new(require('./utils/nodeStatus.js'))(config);
  app.locals.config = config;
  app.locals.configERC20 = configERC20;
  app.use('/', index);
  app.use('/block', block);
  app.use('/tx', tx);
  app.use('/account', account);
  app.use('/accounts', accounts);
  app.use('/contract', contract);
  app.use('/signature', signature);
  app.use('/search', search);
  app.use('/top100', top100);
  app.use('/blocks', blocks);
  app.use('/tx_recent', tx_recent);
  app.use('/peers', peers);
  app.use('/redisblock', redisblock);
  app.use('/hashratechart', hashratechart);
  app.use('/bitzcharts', bitzcharts);
  app.use('/api', api);
  app.use('/prices', prices);

  app.use('/test_batch', test_batch);

  // catch 404 and forward to error handler
  app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });

  // error handler
  app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = {};
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);

    //console.dir(req.url);
    var isJson = false;
    var surl = req.url.split("/");
    //console.dir(surl);
    if (surl && surl.length > 1 && surl[1]) {
      var sparam = surl[1].split("_");
      //console.dir(sparam);
      if (sparam && sparam.length > 1 && sparam[0] === 'api') {
        isJson = true;
      }
    }
    if (isJson) {
      res.json(resultToJson(err, null));
    } else {
      res.render('error');
    }
  });

  console.log("┌───────────────────────────────────────┐");
  console.log("│          Token Load complete          │");
  console.log("└───────────────────────────────────────┘");
  console.log("[Loading Start]\t", serverStartTime);
  console.log("[Loading  End]\t", new Date().toLocaleString());
  //console.dir(accountList);

  if (!configConstant.redisClientMode) {
    cronServices.accountBalanceService = new accountBalanceService(config, configERC20, app);
    cronServices.blockStoreService = new blockStoreService(app);
    cronServices.peerCollectorService = new peerCollectorService(config);
    cronServices.priceService = new priceService();
    cronServices.hashrateCollectorService = new hashrateCollectorService(config);
  }
});

function shouldCompress(req, res) {
  if (req.headers['x-no-compression']) {
    // don't compress responses with this request header
    return false;
  }
  // fallback to standard filter function
  return compression.filter(req, res);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resultToJson(err, param) {
  var result = {};
  result.jsonrpc = '2.0';

  if (err) {
    result.result = err;
    result.success = false;
  } else if (param) {
    result.result = param;
    result.success = true;
  } else {
    result.result = NaN;
    result.success = false;
  }
  return result;
}

module.exports = app;