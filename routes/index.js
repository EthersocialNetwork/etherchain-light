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
      data.blockCount = 150;
      data.lastBlock = new Intl.NumberFormat().format(lastBlock.number);
      data.difficulty = hashFormat(lastBlock.difficulty) + "H";

      if (lastBlock.number - data.blockCount < 0) {
        data.blockCount = lastBlock.number + 1;
      }

      async.times(data.blockCount, function (n, next) {
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
        countBlockTimes++;
      }
      lastBlockTimes = block.timestamp;

      //최근 블럭, 트랜젝션 5개씩 표시
      if (rBlocks.length < 6) {
        rBlocks.push(block);
      }
      block.transactions.forEach(function (tx) {
        if (txs.length < 6) {
          txs.push(tx);
        }
      });
    });
    data.miners = makeReturnSeries(miners, config);
    data.blockTime = new Intl.NumberFormat().format((totalBlockTimes / countBlockTimes).toFixed(4)) + "s";
    data.hashrate = hashFormat(totaDifficulty / totalBlockTimes) + "H/s";

    res.render('index', {
      blocks: rBlocks,
      txs: txs,
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

function makeReturnSeries(arr, config) {
  prcArray = [];
  prcArray = arr.reduce(function (acc, curr) {
    if (typeof acc[curr] == 'undefined') {
      acc[curr] = 1;
    } else {
      acc[curr] += 1;
    }
    return acc;
  }, {});
  resArray = [];
  for (var kcmd in prcArray) {
    resArray.push({
      name: config.names[kcmd] ? ((config.names[kcmd]).split("/"))[0] : (kcmd.substr(0, 8)+"..."),
      value: prcArray[kcmd],
      colorValue: 0,
      address: kcmd
    });
  }
  resArray.push({
    name: '0',
    value: 0,
    colorValue: 0,
    address: ''
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