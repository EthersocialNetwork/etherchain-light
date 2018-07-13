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
  web3.setProvider(config.provider);
  var data = {};

  client.on("error", function (err) {
    console.log("Error " + err);
  });

  async.waterfall([
    function (callback) {
      var rds_key3 = pre_fix.concat("lastblock");
      client.hget(rds_key3, "lastblock", function (err, result) {
        data.dbLastBlock = Number(result);
        callback(err);
      });
    },
    function (callback) {
      web3.eth.getBlock("latest", false, function (err, result) {
        callback(err, result);
      });
    },
    function (lastBlock, callback) {
      data.blockCount = 200;
      data.lastBlock = new Intl.NumberFormat().format(lastBlock.number);
      data.difficulty = hashFormat(lastBlock.difficulty) + "H";
      data.txs = [];

      if (lastBlock.number - data.blockCount < 0) {
        data.blockCount = lastBlock.number + 1;
      }

      async.times(data.blockCount, function (n, next) {
        if (data.dbLastBlock > 0 && data.dbLastBlock > lastBlock.number - n) {
          var field = lastBlock.number - n;
          client.hgetall(pre_fix.concat((field - (field % divide)) + ":").concat(field), function (err, block_info) {
            block_info.isDB = true;
            next(err, block_info);
          });
        } else {
          web3.eth.getBlock(lastBlock.number - n, true, function (err, block) {
            block.isDB = false;
            next(err, block);
          });
        }
      }, function (err, blocks) {
        callback(err, blocks);
      });
      async.times(data.blockCount, function (n, next) {
        web3.eth.getBlock(lastBlock.number - n, true, function (err, block) {
          block.transactions.forEach(function (tx) {
            if (data.txs.length < 6) {
              data.txs.push(tx);
            } else {
              return;
            }
          });
          next(err, block);
        });
      });
    }
  ], function (err, blocks) {
    if (err) {
      return next(err);
    }

    var rBlocks = [];
    var totalBlockTimes = 0;
    var lastBlockTimes = -1;
    var countBlockTimes = 0;
    var totaDifficulty = 0;
    var chartBlockNumber = [];
    var chartBlockTime = [];
    var chartNetHashrate = [];
    var chartDifficulty = [];
    var miners = [];

    Array.prototype.max = function () {
      return Math.max.apply(null, this);
    };

    Array.prototype.min = function () {
      return Math.min.apply(null, this);
    };
    data.minersDiff = [];
    data.minersTime = [];
    data.minersHash = [];

    blocks.forEach(function (block) {
      if (lastBlockTimes > 0) {
        totalBlockTimes += lastBlockTimes - block.timestamp;
        var currentBlockTime = lastBlockTimes - block.timestamp;
        //console.log(currentBlockTime, lastBlockTimes, block.timestamp);
        var currentDifficulty = Number(block.difficulty);
        var currentNetHashrate = currentDifficulty / currentBlockTime;
        chartBlockNumber.push(block.number);
        chartBlockTime.push(currentBlockTime);
        chartDifficulty.push(currentDifficulty / 1000000000000);
        chartNetHashrate.push(currentNetHashrate / 1000000000000);
        totaDifficulty += Number(block.difficulty);
        miners.push(block.miner);
        if (data.minersTime[block.miner]) {
          data.minersTime[block.miner] += currentBlockTime;
        } else {
          data.minersTime[block.miner] = currentBlockTime;
        }
        if (data.minersDiff[block.miner]) {
          data.minersDiff[block.miner] += currentDifficulty;
        } else {
          data.minersDiff[block.miner] = currentDifficulty;
        }
        countBlockTimes++;
      }
      lastBlockTimes = block.timestamp;

      //최근 블럭 5개씩 표시
      if (rBlocks.length < 6) {
        block.author = block.miner;
        block.transactionsCount = block.isDB ? block.transactions : block.transactions.length;
        block.unclesCount = block.isDB ? block.uncles : block.uncles.length;
        rBlocks.push(block);
      }
    });

    for (var keyminer in data.minersTime) {
      data.minersHash[keyminer] = hashFormat((data.minersDiff[keyminer] / totaDifficulty) * data.minersDiff[keyminer] / data.minersTime[keyminer]) + "H/s";
    }

    data.miners = makeReturnSeries(miners, data.minersHash, config);
    data.blockTime = new Intl.NumberFormat().format((totalBlockTimes / countBlockTimes).toFixed(4)) + "s";
    data.hashrate = hashFormat(totaDifficulty / totalBlockTimes) + "H/s";

    res.render('index', {
      blocks: rBlocks,
      txs: data.txs,
      lastblock: data.lastBlock,
      difficulty: data.difficulty,
      blocktime: data.blockTime,
      hashrate: data.hashrate,
      chartMiners: data.miners,
      chartBlockNumber: JSON.stringify(chartBlockNumber.reverse()),
      chartBlockTime: JSON.stringify(chartBlockTime.reverse()),
      chartNetHashrate: JSON.stringify(chartNetHashrate.reverse()),
      chartDifficulty: JSON.stringify(chartDifficulty.reverse()),
      chartNetHashrateMin: JSON.stringify(chartNetHashrate.min()),
      chartNetHashrateMax: JSON.stringify(chartNetHashrate.max()),
      chartDifficultyMin: JSON.stringify(chartDifficulty.min()),
      chartBlockTimeMin: JSON.stringify(chartBlockTime.min()),
      blockCount: data.blockCount
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

function makeReturnSeries(arr, hasharr, config) {
  prcArray = [];
  prcArray = arr.reduce(function (acc, curr) {
    if (acc[curr]) {
      acc[curr] += 1;
    } else {
      acc[curr] = 1;
    }
    return acc;
  }, {});
  resArray = [];
  for (var kcmd in prcArray) {
    resArray.push({
      name: config.names[kcmd] ? ((config.names[kcmd]).split("/"))[0] : (kcmd.substr(0, 8) + "..."),
      value: prcArray[kcmd],
      colorValue: 0,
      address: kcmd,
      hashrate: hasharr[kcmd]
    });
  }
  resArray.push({
    name: '0',
    value: 0,
    colorValue: 0,
    address: '',
    hashrate: "0 H/s"
  });
  resArray = resSortedReturn(resArray);
  var idxColorValue = 1;
  for (var kResArray in resArray) {
    if (resArray.hasOwnProperty(kResArray)) {
      resArray[kResArray].colorValue = idxColorValue++;
    }
  }

  return JSON.stringify(resArray);
}

function resSortedReturn(arr) {
  arr.sort(function (a, b) {
    if (a.value > b.value) {
      return -1;
    }
    if (a.value < b.value) {
      return 1;
    }
    return 0;
  });
  return arr;
}
module.exports = router;