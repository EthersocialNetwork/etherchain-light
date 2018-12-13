var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');
var utf8 = require('utf8');
//var abi = require('ethereumjs-abi');
//var abiDecoder = require('abi-decoder');
/**
 * Should be called to get utf8 from it's hex representation
 *
 * @method toUtf8
 * @param {String} string in hex
 * @returns {String} ascii string representation of hex value
 */
var toUtf8 = function (hex) {
  // Find termination
  var str = "";
  var i = 0,
    l = hex.length;
  if (hex.substring(0, 2) === '0x') {
    i = 2;
  }
  for (; i < l; i += 2) {
    var code = parseInt(hex.substr(i, 2), 16);
    if (code === 0)
      break;
    str += String.fromCharCode(code);
  }

  return utf8.decode(str);
};

router.get('/pending', function (req, res, next) {

  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.selectParity());

  async.waterfall([
    function (callback) {
      web3.parity.pendingTransactions(function (err, result) {
        callback(err, result);
      });
    }
  ], function (err, txs) {
    if (err) {
      console.log("Error ", err);
      return next(err);
    } else {
      txs.forEach(function (tx) {
        tx.gasPrice = parseInt(tx.gasPrice, 16);
      });

      res.render('tx_pending', {
        txs: txs
      });
    }
  });
});


router.get('/submit', function (req, res, next) {
  res.render('tx_submit', {});
});

router.post('/submit', function (req, res, next) {
  if (!req.body.txHex) {
    return res.render('tx_submit', {
      message: "No transaction data specified"
    });
  }

  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.selectParity());

  async.waterfall([
    function (callback) {
      web3.eth.sendRawTransaction(req.body.txHex, function (err, result) {
        callback(err, result);
      });
    }
  ], function (err, hash) {
    if (err) {
      console.log("Error ", err);
      return next({
        message: "Error submitting transaction: "
      });
    } else {
      res.render('tx_submit', {
        message: "Transaction submitted. Hash: " + hash
      });
    }
  });
});

router.get('/:tx', function (req, res, next) {

  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.selectParity());

  var tokenExporter = req.app.get('tokenExporter');

  async.waterfall([
    function (callback) {
      web3.eth.getTransaction(req.params.tx, function (err, result) {
        callback(err, result);
      });
    },
    function (result, callback) {
      if (!result || !result.hash) {
        return callback({
          message: "Transaction hash not found"
        }, null, null);
      }
      web3.eth.getTransactionReceipt(result.hash, function (err, receipt) {
        callback(err, result, receipt);
      });
    },
    function (tx, receipt, callback) {
      web3.trace.transaction(tx.hash, function (err, traces) {
        callback(err, tx, receipt, traces);
      });
    },
    function (tx, receipt, traces, callback) {
      web3.eth.getBlock(tx.blockNumber, false, function (err, block) {
        if (block) {
          callback(err, tx, receipt, traces, block.timestamp);
        } else {
          callback(err, tx, receipt, traces, null);
        }
      });
    },
    function (tx, receipt, traces, timestamp, callback) {
      //console.dir(tx);
      if (timestamp) {
        tx.timestamp = timestamp;
      }

      if (tx.to && tokenExporter[tx.to]) {
        tx.isContract = true;
        if (tokenExporter[tx.to].token_decimals) {
          tx.token_decimals = tokenExporter[tx.to].token_decimals;
        } else {
          tx.token_decimals = 0;
        }

        if (tokenExporter[tx.to].token_symbol) {
          tx.token_symbol = tokenExporter[tx.to].token_symbol;
        } else {
          tx.token_symbol = 'n/a';
        }

        if (tokenExporter[tx.to] && tokenExporter[tx.to].contract) {
          var allEvents = tokenExporter[tx.to].contract.allEvents({
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
          });
          allEvents.get(function (err, events) {
            if (err) {
              console.log("Error receiving historical events:", err);
              callback(err, tx, receipt, traces, null);
            } else {
              callback(err, tx, receipt, traces, events);
            }
          });
        } else {
          callback(null, tx, receipt, traces, null);
        }
      } else {
        callback(null, tx, receipt, traces, null);
      }
    },
    function (tx, receipt, traces, events, callback) {
      tx.isinTransfer = false;
      if (events) {
        //console.dir(events);
        async.eachSeries(events, function (event, eventsEachCallback) {
          //console.dir(event);
          if (event.event === "Transfer" || event.event === "Approval") {
            if (event.args && event.args._value && tx.transactionIndex == event.transactionIndex) {
              tx._value = "0x".concat(event.args._value.toNumber().toString(16));
              tx._from = event.args._from;
              tx._to = event.args._to;
              tx._event = event.event;
              tx.isinTransfer = true;
            }
          }
          eventsEachCallback();
        }, function (err) {
          if (err) {
            callback(err, tx, receipt, traces, 0, "");
          } else {
            callback(null, tx, receipt, traces, tx._value, tx._to);
          }
        });
      } else {
        callback(null, tx, receipt, traces, 0, "");
      }
    }
  ], function (err, tx, receipt, traces, _value, _to) {
    if (err) {
      console.log("TX Error ", err);
      return next(err);
    } else {

      //console.dir(tx);

      // Try to match the tx to a solidity function call if the contract source is available
      /* TODO: logs
      if (events) {
        tx.source = JSON.parse(source);
        try {
          var jsonAbi = JSON.parse(tx.source.abi);
          abiDecoder.addABI(jsonAbi);
          tx.logs = abiDecoder.decodeLogs(receipt.logs);
          tx.callInfo = abiDecoder.decodeMethod(tx.input);
        } catch (e) {
          console.log("Error parsing ABI:", tx.source.abi, e);
        }
      }
      */
      if (tx) {
        tx.traces = [];
        tx.failed = false;
        tx.gasUsed = 0;
        if (traces != null) {
          traces.forEach(function (trace) {
            tx.traces.push(trace);
            if (trace.error) {
              tx.failed = true;
              tx.error = trace.error;
            }
            if (trace.result && trace.result.gasUsed) {
              tx.gasUsed += parseInt(trace.result.gasUsed, 16);
            }
          });

          /*if (tx.traces.length > 1) {
            console.dir(tx.traces);
            console.log("============== [ tx.traces.length > 1 ] ==============");
          }*/
        }

        if (tx && tx.input) {
          //tx.inputToAscii = web3.toAscii(tx.input);
          tx.inputToUtf8 = toUtf8(tx.input);
        }

        res.render('tx', {
          tx: tx
        });
      } else {
        res.status(404).send('tx not found.');
      }
    }
  });

});

router.get('/raw/:tx', function (req, res, next) {

  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.selectParity());

  async.waterfall([
    function (callback) {
      web3.eth.getTransaction(req.params.tx, function (err, result) {
        return callback(err, result);
      });
    },
    function (tx, callback) {
      web3.trace.replayTransaction(tx.hash, ["vmTrace", "trace", "stateDiff"], function (err, traces) {
        tx.traces = traces;
        return callback(err, tx);
      });
    }
  ], function (err, tx) {
    if (err) {
      console.log("TX Error ", err);
      return next(err);
    } else {
      //console.dir(tx);
      res.render('tx_raw', {
        tx: tx
      });
    }
  });
});

module.exports = router;