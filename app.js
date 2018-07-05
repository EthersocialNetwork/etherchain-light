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

var config = new(require('./config.js'))();

var leveldown = require('leveldown');
var levelup = require('levelup');
var db = levelup(leveldown('/root/esn_install/parity/chaindata/chains/ethersocial/db/dc73f323b4681272/snapshot/current'));
// ./data 
// ~/esn_install/parity/chaindata/chains/ethersocial/db/dc73f323b4681272/archive/db
// ~/esn_install/parity/chaindata/chains/ethersocial/db/dc73f323b4681272/snapshot/current
// /root/esn_install/parity/chaindata/chains/ethersocial/db/dc73f323b4681272/snapshot/current

var app = express();
app.use(compression({
  filter: shouldCompress
}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.set('config', config);
app.set('db', db);
app.set('trust proxy', true);

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger(config.logFormat));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.locals.moment = require('moment');
app.locals.numeral = require('numeral');
app.locals.ethformatter = require('./utils/ethformatter.js');
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

function shouldCompress(req, res) {
  if (req.headers['x-no-compression']) {
    // don't compress responses with this request header
    return false;
  }

  // fallback to standard filter function
  return compression.filter(req, res);
}

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

module.exports = app;