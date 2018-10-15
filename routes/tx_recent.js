var express = require('express');
var router = express.Router();
var async = require('async');
var Web3 = require('web3');

router.get('/', function (req, res, next) {

  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.providerSubGESN);

  async.waterfall([
    function (callback) {
      web3.eth.getBlock("latest", false, function (err, result) {
        return callback(err, result);
      });
    },
    function (lastBlock, callback) {
      var blockCount = 100;

      if (lastBlock.number - blockCount < 0) {
        blockCount = lastBlock.number + 1;
      }

      async.times(blockCount, function (n, next) {
        web3.eth.getBlock(lastBlock.number - n, true, function (err, block) {
          next(err, block);
        });
      }, function (err, blocks) {
        return callback(err, blocks);
      });
    }
  ], function (err, blocks) {
    if (err) {
      console.log("Error " + err);
    }

    var txs = [];
    blocks.forEach(function (block) {
      if (txs.length >= 100) {
        return;
      }
      block.transactions.forEach(function (tx) {
        if (txs.length >= 100) {
          return;
        }
        txs.push(tx);
        //console.dir(tx);
      });
    });
    res.render('tx_recent', {
      blocks: blocks,
      txs: txs
    });
  });
});

module.exports = router;