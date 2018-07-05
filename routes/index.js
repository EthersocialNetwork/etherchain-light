var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');


router.get('/', function (req, res, next) {

  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.provider);
  var data = {};

  async.waterfall([
    function (callback) {
      web3.eth.getBlock("latest", false, function (err, result) {
        callback(err, result);
      });
    },
    function (lastBlock, callback) {
      var blocks = [];
      var blockCount = 100;
      data.lastBlock = new Intl.NumberFormat().format(lastBlock.number);

      if (lastBlock.difficulty > 1000000000000) {
        data.difficulty = new Intl.NumberFormat().format((lastBlock.difficulty / 1000000000000).toFixed(4)) + "TH";
      } else if (lastBlock.difficulty > 1000000000) {
        data.difficulty = new Intl.NumberFormat().format((lastBlock.difficulty / 1000000000).toFixed(4)) + "GH";
      } else if (lastBlock.difficulty > 1000000) {
        data.difficulty = new Intl.NumberFormat().format((lastBlock.difficulty / 1000000).toFixed(4)) + "MH";
      } else {
        data.difficulty = new Intl.NumberFormat().format((lastBlock.difficulty / 1000).toFixed(4)) + "KH";
      }

      if (lastBlock.number - blockCount < 0) {
        blockCount = lastBlock.number + 1;
      }

      async.times(blockCount, function (n, next) {
        web3.eth.getBlock(lastBlock.number - n, true, function (err, block) {
          next(err, block);
        });
      }, function (err, blocks) {
        callback(err, blocks);
      });
    }
  ], function (err, blocks) {
    if (err) {
      return next(err);
    }

    var txs = [];
    var rBlocks = [];
    var totalBlockTimes = 0;
    var lastBlockTimes = -1;
    var countBlockTimes = 0;

    var totaDifficulty = 0;

    blocks.forEach(function (block) {
      countBlockTimes++;
      if (lastBlockTimes > 0) {
        totalBlockTimes += lastBlockTimes - block.timestamp;
        totaDifficulty += Number(block.difficulty);
      }
      lastBlockTimes = block.timestamp;
      if (rBlocks.length < 6) {
        rBlocks.push(block);
      }
      block.transactions.forEach(function (tx) {
        if (txs.length < 6) {
          txs.push(tx);
        }
      });
    });
    data.blockTime = new Intl.NumberFormat().format((totalBlockTimes / countBlockTimes).toFixed(4)) + "s";

    var totalHashrate = ((totaDifficulty / totalBlockTimes));
    if (totalHashrate > 1000000000000) {
      data.hashrate = new Intl.NumberFormat().format((totalHashrate / 1000000000000).toFixed(4)) + "TH/s";
    } else if (totalHashrate > 1000000000) {
      data.hashrate = new Intl.NumberFormat().format((totalHashrate / 1000000000).toFixed(4)) + "GH/s";
    } else if (totalHashrate > 1000000) {
      data.hashrate = new Intl.NumberFormat().format((totalHashrate / 1000000).toFixed(4)) + "MH/s";
    } else {
      data.hashrate = new Intl.NumberFormat().format((totalHashrate / 1000).toFixed(4)) + "KH/s";
    }

    res.render('index', {
      blocks: rBlocks,
      txs: txs,
      lastblock: data.lastBlock,
      difficulty: data.difficulty,
      blocktime: data.blockTime,
      hashrate: data.hashrate
    });
  });

});

module.exports = router;