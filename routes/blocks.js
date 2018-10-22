var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');
const redis = require("redis");
const client = redis.createClient();
const pre_fix = 'explorerBlocks:';
const divide = 10000;

router.get('/', function (req, res, next) {
  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.selectParity());
  var data = {};

  client.on("error", function (err) {
    console.log("Error ", err);
  });

  async.waterfall([
    function (callback) {
      var rds_key3 = pre_fix.concat("lastblock");
      client.hget(rds_key3, "lastblock", function (err, result) {
        return callback(err, result);
      });
    },
    function (dbLastBlock, callback) {
      data.dbLastBlock = Number(dbLastBlock);
      web3.eth.getBlock("latest", false, function (err, result) {
        return callback(err, result);
      });
    },
    function (lastBlock, callback) {
      var blockCount = 50;

      if (lastBlock.number - blockCount < 0) {
        blockCount = lastBlock.number + 1;
      }

      async.times(blockCount, function (n, next) {
        if (data.dbLastBlock > 0 && data.dbLastBlock > lastBlock.number - n) {
          var field = lastBlock.number - n;
          client.hgetall(pre_fix.concat((field - (field % divide)) + ":").concat(field), function (err, block_info) {
            block_info.isDB = true;
            block_info.author = block_info.miner;
            block_info.transactionsCount = block_info.transactions;
            block_info.unclesCount = block_info.uncles;
            next(err, block_info);
          });
        } else {
          web3.eth.getBlock(lastBlock.number - n, false, function (err, block) {
            block.isDB = false;
            block.author = block.miner;
            block.transactionsCount = block.transactions.length;
            block.unclesCount = block.uncles.length;
            next(err, block);
          });
        }
      }, function (err, blocks) {
        callback(err, blocks);
      });
    }
  ], function (err, blocks) {
    if (err) {
      console.log("Error", err);
      return next(err);
    }

    res.render('blocks', {
      blocks: blocks
    });
    blocks = null;
  });

});

module.exports = router;