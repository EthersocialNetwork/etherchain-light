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
var top100_settingup = require('./routes/top100_settingup');
var peers = require('./routes/peers');
var redisblock = require('./routes/redisblock');
var hashratechart = require('./routes/hashratechart');
var bitzcharts = require('./routes/bitzcharts');

var test_batch = require('./routes/test_batch');

var config = new(require('./config.js'))();

var level = require('level-rocksdb');
//var db = levelup(leveldown('/home/sejun/.local/share/io.parity.ethereum/chains/ethersocial/db/dc73f323b4681272/snapshot'));
var db = level('/home/sejun/.local/share/io.parity.ethereum/chains/ethersocial/db/dc73f323b4681272/archive');

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

var contractAccountList = [];
var tokenExporter = {};

async.waterfall([
  function (callback) {
    client.hgetall('esn_contracts:transfercount', function (err, replies) {
      callback(null, replies);
    });
  },
  function (result, callback) {
    async.eachOfSeries(result, function (value, key, forEachOfCallback) {
      if (value > 0) {
        contractAccountList.push(key);
      }
      forEachOfCallback();
    }, function (err) {
      if (err) {
        console.log("[ERROR] exporter1: ", err);
      }
      callback(null, contractAccountList);
    });
  },
  function (accountList, callback) {
    async.eachSeries(accountList, function (account, eachSeriesCallback) {
      tokenExporter[account] = new tokenExporterService(config, account, 1);
      sleep(50).then(() => {
        eachSeriesCallback();
      });
    }, function (err) {
      if (err) {
        console.log("[ERROR] exporter2: ", err);
      } else {
        app.set('tokenExporter', tokenExporter);
      }
      callback(null, accountList);
    });
  }
], function (err, accountList) {
  console.log("┌───────────────────────────────────────┐");
  console.log("│          Token Load Complite          │");
  console.log("└───────────────────────────────────────┘");
  console.log(new Date().toLocaleString());
  //console.dir(accountList);
});

//var db = levelup(leveldown('./data')); 
// ~/esn_install/parity/chaindata/chains/ethersocial/db/dc73f323b4681272/archive/db
// ~/esn_install/parity/chaindata/chains/ethersocial/db/dc73f323b4681272/snapshot/current
// /root/esn_install/parity/chaindata/chains/ethersocial/db/dc73f323b4681272/snapshot/current

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.set('config', config);
app.set('db', db);
app.set('trust proxy', true);

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
app.locals.nameformatter = new(require('./utils/nameformatter.js'))(config);
app.locals.nodeStatus = new(require('./utils/nodeStatus.js'))(config);
app.locals.config = config;

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
app.use('/top100_settingup', top100_settingup);
app.use('/peers', peers);
app.use('/redisblock', redisblock);
app.use('/hashratechart', hashratechart);
app.use('/bitzcharts', bitzcharts);

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
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
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

module.exports = app;