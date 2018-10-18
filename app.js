var serverStartTime = new Date().toLocaleString();
var express = require('express');
var compression = require('compression');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var index = require('./routes/index');
var blocks = require('./routes/blocks');
var tx_recent = require('./routes/tx_recent');
var block = require('./routes/block');
var tx = require('./routes/tx');
var account = require('./routes/account');
var accounts = require('./routes/accounts');
var contract = require('./routes/contract');
var signature = require('./routes/signature');
var search = require('./routes/search');
var top100 = require('./routes/top100');
var peers = require('./routes/peers');
var redisblock = require('./routes/redisblock');
var hashratechart = require('./routes/hashratechart');
var servercheckchart = require('./routes/servercheckchart');
var bitzcharts = require('./routes/bitzcharts');
var api = require('./routes/api');

var api_proxy = require('./api/proxy');
var api_account = require('./api/account');
var api_info = require('./api/info');

var test_batch = require('./routes/test_batch');

var config = new(require('./config/config.js'))();
var configERC20 = new(require('./config/configERC20.js'))();
var configNames = new(require('./config/configNames.js'))();

var level = require('level-rocksdb');
var db = level(config.dbPath);

var redis = require("redis"),
  client = redis.createClient();
client.on("error", function (err) {
  console.log("Error " + err);
});

var app = express();
app.use(compression({
  filter: shouldCompress
}));

var async = require('async');
var tokenExporterService = require('./services/tokenExporter.js');
var serverPortCheckService = require('./services/serverPortCheck.js');
var accountBalanceService = require('./services/accountBalanceService');
var blockStoreService = require('./services/blockStoreService');
var peerCollectorService = require('./services/peerCollectorService');
var hashrateCollectorService = require('./services/hashrateCollectorService');

var contractAccountList = [];
var tokenExporter = {};
var serverPortCheck = {};

var cronServices = {};
async.waterfall([
  function (callback) {
    client.hgetall('esn_contracts:eventslength', function (err, replies) {
      callback(null, replies);
    });
  },
  function (result, callback) {
    //console.dir(result);
    var sortable = [];
    for (var adr in result) {
      sortable.push([adr, result[adr]]);
    }
    sortable.sort(function (a, b) {
      return Number(a[1]) - Number(b[1]);
    });

    async.eachSeries(sortable, function (iter, forEachOfCallback) {
      var eventslength = iter[1],
        account = iter[0];
      contractAccountList.push(account);
      var timeout = eventslength < 1 ? parseInt(config.tokenLoadDelay, 10) : parseInt(config.tokenLoadDelay, 10) + (eventslength * 3);
      //console.log(account,"start", Date.now());
      tokenExporter[account] = new tokenExporterService(config.providerIpc, configERC20.erc20ABI, account, 1, timeout);
      //console.log("[timeout]", account, " : ", timeout);
      sleep(timeout).then(() => {
        forEachOfCallback();
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
  app.set('configNames', configNames);
  app.set('db', db);
  app.set('trust proxy', true);

  //APIs
  app.all('/api_proxy/*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
  });
  app.use('/api_proxy', api_proxy);

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
  app.use(logger(config.logFormat, {
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
  app.locals.nameformatter = new(require('./utils/nameformatter.js'))(configNames);
  app.locals.nodeStatus = new(require('./utils/nodeStatus.js'))(config);
  app.locals.config = config;
  app.locals.configERC20 = configERC20;
  app.locals.configNames = configNames;
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
  app.use('/servercheckchart', servercheckchart);
  app.use('/bitzcharts', bitzcharts);
  app.use('/api', api);

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

  cronServices.accountBalanceService = new accountBalanceService(config, configERC20, app);
  cronServices.blockStoreService = new blockStoreService(config);
  cronServices.peerCollectorService = new peerCollectorService(config);
  cronServices.hashrateCollectorService = new hashrateCollectorService(config);

  if (config.serverPortCheck) {
    var serverPortCheckList = config.getArrParity();

    async.eachSeries(serverPortCheckList, function (server, forEachOfCallback) {
      serverPortCheck[server] = new serverPortCheckService(server, config);
      console.log('[serverPortCheckService]', server);
      sleep(100).then(() => {
        forEachOfCallback();
      });
    }, function (err) {
      if (err) {
        console.log("[ERROR] serverPortCheck listing: ", err);
      } else {
        app.set('serverPortCheck', serverPortCheck);
        app.set('serverPortCheckList', serverPortCheckList);
      }
    });
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