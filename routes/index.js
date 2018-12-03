var express = require('express');
var router = express.Router();
var getJSON = require('get-json');
var async = require('async');
var Web3 = require('web3');
var BigNumber = require('bignumber.js');
var request = require('request');

const configConstant = require('../config/configConstant');
const configNames = require('../config/configNames.js');

var Redis = require('ioredis');
var redis = new Redis(configConstant.redisConnectString);

const pre_fix = 'explorerBlocks:';
const divide = 10000;

router.get('/', function (req, res, next) {
  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.selectParity());
  var data = {};
  data.bitzTimeoutTicker = false;
  data.bitzTimeoutCoinrate = false;
  data.ticker = {};
  data.coinrate = {};

  data.bimax = {};
  data.bimax.timeoutTicker = false;

  Object.size = function (obj) {
    var size = 0,
      key;
    for (key in obj) {
      if (obj.hasOwnProperty(key)) size++;
    }
    return size;
  };

  async.waterfall([
      //bimax 시작
      function (callback) {
        redis.hgetall('bimax:'.concat('price'), function (err, result) {
          return callback(err, result);
        });
      },
      function (ticker, callback) {
        if (ticker && Object.size(ticker) > 0) {
          data.bimax = ticker;
        }
        var now = new Date();
        if (!ticker || Object.size(ticker) < 1 || (ticker && ticker.time * 1000 < now - (1000 * 60))) {
          data.bimax.timeoutTicker = true;

          var headers = {
            'authority': 'api2.bimax.io',
            'Origin': 'https://www.bimax.io',
            //'Accept-Encoding': 'gzip, deflate, br',
            //'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36',
            //'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            //'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': 'https://www.bimax.io/trade?pairName=ESN/KRW',
          };

          var formData = {
            pairName: 'BTC/KRW'
          };

          var options = {
            url: 'https://api2.bimax.io/ticker/publicSignV2',
            method: 'POST',
            headers: headers,
            form: formData
          };

          request.post(options, function (error, response, body) {
            //console.log("error:", error);
            //console.log("body:", body);
            //console.log("response:", response);
            return callback(error, body);
          });
        } else {
          return callback(null, null);
        }
      },
      function (bodyText, callback) {
        if (bodyText) {
          if (bodyText.toString().includes('<html>')) {
            console.log("[Warning] BIMAX sent an incorrect response.");
            return callback(null);
          } else if (data.bimax.timeoutTicker) {
            var ticker = JSON.parse(bodyText.trim());
            var tickerall = ticker.data;
            for (var key in tickerall) {
              if (tickerall.hasOwnProperty(key)) {
                if (key == "ESN/KRW") {
                  data.bimax.nowPrice = tickerall[key].nowPrice;
                  data.bimax.high = tickerall[key].high;
                  data.bimax.low = tickerall[key].low;
                  data.bimax.tradeAmount = tickerall[key].tradeAmount;
                }
              }
            }
            var now = new Date();
            data.bimax.time = now.getTime() / 1000;
            redis.hmset('bimax:'.concat('price'), data.bimax);
          } else {
            //console.log("[Notice] BIMAX cache time left.");
          }
        } else {
          console.log("[Warning] 'bodyText' returned by BIMAX was null.");
        }
        return callback(null);
      },
      //bimax 종료
      function (callback) {
        redis.hgetall('bitz:'.concat('ticker'), function (err, result) {
          return callback(err, result);
        });
      },
      function (ticker, callback) {
        if (ticker && Object.size(ticker) > 0) {
          data.ticker = ticker;
        }
        var now = new Date();
        if (!ticker || Object.size(ticker) < 1 || (ticker && ticker.time * 1000 < now - (1000 * 60))) {
          data.bitzTimeoutTicker = true;
          getJSON('https://apiv2.bitz.com/Market/ticker?symbol=esn_btc', function (error, response) {
            return callback(error, response);
          });
        } else {
          return callback(null, null);
        }
      },
      function (ticker, callback) {
        if (data.bitzTimeoutTicker && ticker != null && ticker.status == 200) {
          data.ticker = ticker.data;
          data.ticker.time = ticker.time;
        }
        redis.hgetall('bitz:'.concat('coinrate'), function (err, result) {
          return callback(err, result);
        });
      },
      function (coinrate, callback) {
        if (coinrate && Object.size(coinrate) > 0) {
          data.coinrate = coinrate;
        }
        var now = new Date();
        if (!coinrate || Object.size(coinrate) < 1 || (coinrate && coinrate.time * 1000 < now - (1000 * 60))) {
          data.bitzTimeoutCoinrate = true;
          getJSON('https://apiv2.bitz.com/Market/coinRate?coins=esn', function (error, response) {
            return callback(error, response);
          });
        } else {
          return callback(null, null);
        }
      },
      function (coinrate, callback) {
        if (data.bitzTimeoutCoinrate && coinrate != null && coinrate.status == 200) {
          data.coinrate = coinrate.data.esn;
          data.coinrate.time = coinrate.time;
        }

        var ret = new BigNumber(data.coinrate.btc);
        data.coinrate.btc = ret.toFormat(8);
        ret = new BigNumber(data.coinrate.usd);
        data.coinrate.usd = ret.toFormat(6);
        ret = new BigNumber(data.coinrate.krw);
        data.coinrate.krw = ret.toFormat(2);

        redis.hmset('bitz:'.concat('ticker'), data.ticker);
        redis.hmset('bitz:'.concat('coinrate'), data.coinrate);

        var rds_key3 = pre_fix.concat("lastblock");
        redis.hget(rds_key3, "lastblock", function (err, result) {
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
        data.blockCount = 200;
        data.lastBlock = new Intl.NumberFormat().format(lastBlock.number);
        data.lastBlockNumber = lastBlock.number;
        data.difficulty = hashFormat(lastBlock.difficulty) + "H";
        if (lastBlock.number - data.blockCount < 0) {
          data.blockCount = lastBlock.number + 1;
        }

        async.times(data.blockCount, function (n, next) {
          if (data.dbLastBlock > 0 && data.dbLastBlock > lastBlock.number - n) {
            var field = lastBlock.number - n;
            redis.hgetall(pre_fix.concat((field - (field % divide)) + ":").concat(field), function (err, block_info) {
              if (block_info) {
                block_info.isDB = true;
              }
              next(err, block_info);
            });
          } else {
            web3.eth.getBlock(lastBlock.number - n, false, function (err, block) {
              block.isDB = false;
              next(err, block);
            });
          }
        }, function (err, blocks) {
          return callback(err, blocks);
        });
      },
      function (blocks, callback) {
        data.txs = [];

        async.times(10, function (n, next) {
          web3.eth.getBlock(data.lastBlockNumber - n, true, function (err, txBlock) {
            for (let i = 0; i < txBlock.transactions.length; i++) {
              if (data.txs.length < 5) {
                data.txs.push(txBlock.transactions[i]);
              }
            }
            next(err, txBlock);
          });
        }, function (err, tmpBlocks) {
          return callback(err, tmpBlocks, blocks);
        });
      }
    ],
    function (err, tmpBlocks, blocks) {
      if (err) {
        console.log("Error ", err);
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

      data.chartDataNumbers = 100;
      var cntChartData = 0;
      blocks.forEach(function (block) {
        if (block) {
          if (lastBlockTimes > 0) {
            totalBlockTimes += lastBlockTimes - block.timestamp;
            var currentBlockTime = lastBlockTimes - block.timestamp;
            var currentDifficulty = Number(block.difficulty);
            var currentNetHashrate = currentDifficulty / currentBlockTime;

            if (cntChartData++ < data.chartDataNumbers) {
              chartBlockNumber.push(block.number);
              chartBlockTime.push(currentBlockTime);
              chartDifficulty.push(currentDifficulty / 1000000000000);
              chartNetHashrate.push(currentNetHashrate / 1000000000000);
            }
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
          //});
          //tmpBlocks.forEach(function (block) {
          //최근 블럭 5개씩 표시
          if (rBlocks.length < 5) {
            block.author = block.miner;
            block.transactionsCount = block.isDB ? block.transactions : block.transactions.length;
            block.unclesCount = block.isDB ? block.uncles : block.uncles.length;
            rBlocks.push(block);
          }
        }
      });
      for (var keyminer in data.minersTime) {
        data.minersHash[keyminer] = hashFormat((data.minersDiff[keyminer] / totaDifficulty) * data.minersDiff[keyminer] / data.minersTime[keyminer]) + "H/s";
      }

      data.miners = makeReturnSeries(miners, data.minersHash);
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
        blockCount: data.blockCount,
        chartDataNumbers: data.chartDataNumbers,
        ticker: data.ticker,
        bimax: data.bimax,
        coinrate: data.coinrate,
        jsload_defer: configConstant.jsload_defer,
        jsload_async: configConstant.jsload_async
      });
      data = null;
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

function makeReturnSeries(arr, hasharr) {
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
      name: configNames.names[kcmd] ? ((configNames.names[kcmd]).split("/"))[0] : configNames.holdnames[kcmd] ? (('Long-term holding: '.concat(configNames.holdnames[kcmd])).split("/"))[0] : (kcmd.substr(0, 8) + "..."),
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