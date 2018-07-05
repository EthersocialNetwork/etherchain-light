var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');
const redis = require("redis");
const client = redis.createClient();
const pre_fix = 'explorerBlocks:';
const divide = 10000;

router.get('/:end?', function (req, res, next) {
  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.provider);
  var data = {};
  data.blocks = [];
  data.blocksContain = [];
  data.txs = [];
  data.startTime = new Date();
  data.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  client.on("error", function (err) {
    console.log("Error " + err);
  });

  async.waterfall([
    function (callback) {
      var rds_key = pre_fix.concat("list");
      client.hgetall(rds_key, function (err, replies) {
        var pre_fields = [];
        for (var blocknumber in replies) {
          pre_fields.push(blocknumber);
        }
        callback(err, pre_fields);
      });
    },
    function (pre_fields, callback) {
      async.eachSeries(pre_fields, function (field, eachCallback) {
        client.hgetall(pre_fix.concat((field - (field % divide)) + ":").concat(field), function (err, block_info) {
          if (err) {
            return eachCallback(err);
          }
          if (!block_info) {
            console.log("no block_info: " + pre_fix.concat(field));
          } else {
            data.blocks.push(block_info);
            data.blocksContain.push(block_info.number);
          }
          eachCallback();
        });
      }, function (err) {
        callback(err);
      });
    },
    function (callback) {
      web3.eth.getBlock("latest", false, function (err, result) {
        callback(err, result);
      });
    },
    function (latestBlock, callback) {
      data.lastBlock = new Intl.NumberFormat().format(latestBlock.number);
      if (req.params.end && req.params.end < latestBlock.number) {
        web3.eth.getBlock(req.params.end, false, function (err, result) {
          callback(err, result);
        });
      } else {
        callback(null, latestBlock);
      }
    },
    function (lastBlock, callback) {
      data.blockCount = 1000;
      if (lastBlock.number - data.blockCount < 0) {
        data.blockCount = lastBlock.number + 1;
      }
      async.times(data.blockCount, function (n, next) {
        if (data.blocksContain[lastBlock.number - n]) {
          console.dir(data.blocksContain[lastBlock.number - n]);
          console.dir(data.blocks[lastBlock.number - n]);
          next(null, data.blocks[lastBlock.number - n]);
        } else {
          web3.eth.getBlock(lastBlock.number - n, true, function (err, block) {
            next(err, block);
          });
        }
      }, function (err, blocks) {
        callback(err, blocks);
      });
    }
  ], function (err, blocks) {
    if (err) {
      return next(err);
    }
    Array.prototype.max = function () {
      return Math.max.apply(null, this);
    };

    Array.prototype.min = function () {
      return Math.min.apply(null, this);
    };

    var totalBlockTimes = 0;
    var lastBlockTimes = -1;
    var countBlockTimes = 0;
    var totaDifficulty = 0;
    data.txnumber = 0;
    data.dbBlock = 0;
    blocks.forEach(function (block) {
      if (lastBlockTimes > 0) {
        totalBlockTimes += lastBlockTimes - block.timestamp;
        totaDifficulty += Number(block.difficulty);
        countBlockTimes++;
      }
      lastBlockTimes = block.timestamp;

      if (data.blocksContain[block.number]) {
        data.txnumber += block.transactions;
        data.dbBlock++;
      } else {
        data.txnumber += block.transactions ? block.transactions.length : 0;
        if (data.ip == "115.68.0.74") {
          var rds_value = {
            number: block.number.toString(),
            hash: block.hash,
            parentHash: block.parentHash,
            nonce: block.nonce,
            sha3Uncles: block.sha3Uncles,
            logsBloom: block.logsBloom,
            transactionsRoot: block.transactionsRoot,
            stateRoot: block.stateRoot,
            miner: block.miner,
            difficulty: block.difficulty.toString(),
            totalDifficulty: block.totalDifficulty.toString(),
            extraData: block.extraData,
            size: block.size.toString(),
            gasLimit: block.gasLimit.toString(),
            gasUsed: block.gasUsed.toString(),
            timestamp: block.timestamp.toString(),
            transactions: block.transactions ? block.transactions.length : 0,
            uncles: block.uncles ? block.uncles.length : 0
          };
          var rds_key = pre_fix.concat("list");
          client.hset(rds_key, block.number, block.miner);
          var rds_key2 = pre_fix.concat((block.number - (block.number % divide)) + ":").concat(block.number);
          client.hmset(rds_key2, rds_value);
        }
      }
    });
    data.blockTime = new Intl.NumberFormat().format((totalBlockTimes / countBlockTimes).toFixed(4)) + "s";
    data.difficulty = hashFormat(totaDifficulty / countBlockTimes) + "H";
    data.hashrate = hashFormat(totaDifficulty / totalBlockTimes) + "H/s";

    data.startblockntime = Number(blocks[0].number).toLocaleString() + " block (" + new Date(blocks[0].timestamp * 1000) + ")";
    data.endblockntime = Number(blocks[blocks.length - 1].number).toLocaleString() + " block (" + new Date(blocks[blocks.length - 1].timestamp * 1000) + ")";
    data.endTime = new Date();
    data.consumptionTime = ((data.endTime - data.startTime) / 1000).toLocaleString(undefined, {
      maximumFractionDigits: 4
    }) + " s";
    data.txnumber = data.txs.length.toLocaleString();

    res.render('redisblock', {
      startTime: data.startTime,
      blockCount: data.blockCount,
      lastBlock: data.lastBlock,
      blockTime: data.blockTime,
      difficulty: data.difficulty,
      hashrate: data.hashrate,
      startblock: data.startblockntime,
      endblock: data.endblockntime,
      endTime: data.endTime,
      consumptionTime: data.consumptionTime,
      transactionsCount: data.txnumber,
      dbBlock: data.dbBlock
    });
  });

});

function hashFormat(number) {
  if (number > 1000000000000000) {
    return new Intl.NumberFormat().format((number / 1000000000000000).toFixed(4)) + "P";
  } else if (number > 1000000000000) {
    return new Intl.NumberFormat().format((number / 1000000000000).toFixed(4)) + "T";
  } else if (number > 1000000000) {
    return new Intl.NumberFormat().format((number / 1000000000).toFixed(4)) + "G";
  } else if (number > 1000000) {
    return new Intl.NumberFormat().format((number / 1000000).toFixed(4)) + "M";
  } else if (number > 1000) {
    return new Intl.NumberFormat().format((number / 1000).toFixed(4)) + "K";
  } else {
    return new Intl.NumberFormat().format((number).toFixed(4));
  }
}
module.exports = router;