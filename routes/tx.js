var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');
var abi = require('ethereumjs-abi');
var abiDecoder = require('abi-decoder');

router.get('/pending', function (req, res, next) {

  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.provider);

  async.waterfall([
    function (callback) {
      web3.parity.pendingTransactions(function (err, result) {
        callback(err, result);
      });
    }
  ], function (err, txs) {
    if (err) {
      console.log("Error " + err);
    }

    txs.forEach(function (tx) {
      tx.gasPrice = parseInt(tx.gasPrice, 16);
    });

    res.render('tx_pending', {
      txs: txs
    });
    web3 = null;
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
  web3.setProvider(config.provider);

  async.waterfall([
    function (callback) {
      web3.eth.sendRawTransaction(req.body.txHex, function (err, result) {
        callback(err, result);
      });
    }
  ], function (err, hash) {
    if (err) {
      res.render('tx_submit', {
        message: "Error submitting transaction: " + err
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
  web3.setProvider(config.provider);

  var db = req.app.get('db');

  async.waterfall([
    function (callback) {
      web3.eth.getTransaction(req.params.tx, function (err, result) {
        return callback(err, result);
      });
    },
    function (result, callback) {
      if (!result || !result.hash) {
        return callback({
          message: "Transaction hash not found"
        }, null, null);
      }
      web3.eth.getTransactionReceipt(result.hash, function (err, receipt) {
        return callback(err, result, receipt);
      });
    },
    function (tx, receipt, callback) {
      web3.trace.transaction(tx.hash, function (err, traces) {
        return callback(err, tx, receipt, traces);
      });
    },
    function (tx, receipt, traces, callback) {
      //console.dir(tx);
      if (tx.to) {
        db.get(tx.to, function (err, value) {
          return callback(null, tx, receipt, traces, value);
        });
      } else {
        db.get(tx.from, function (err, value) {
          return callback(null, tx, receipt, traces, value);
        });
      }
    }
  ], function (err, tx, receipt, traces, source) {
    if (err) {
      console.log("Error " + err);
    }

    // Try to match the tx to a solidity function call if the contract source is available
    if (source) {
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
    }
    // console.log(tx.traces);    
    res.render('tx', {
      tx: tx
    });
  });

});

router.get('/raw/:tx', function (req, res, next) {

  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.provider);

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
      console.log("Error " + err);
    }
    //console.dir(tx);
    res.render('tx_raw', {
      tx: tx
    });
  });
});

module.exports = router;