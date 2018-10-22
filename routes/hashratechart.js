var express = require('express');
var router = express.Router();

var async = require('async');
const redis = require("redis");
const pre_fix = 'explorerBlocks:';
const pre_fix_chart = 'explorerBlocksChart:';
const divide = 10000;

router.get('/', function (req, res, next) {
  var config = req.app.get('config');
  var data = {};
  var tmpData = {};
  tmpData.BlockTime = [];
  tmpData.Difficulty = [];
  tmpData.NetHashrate = [];
  tmpData.Transactions = [];

  data.startTime = new Date();
  data.dbLastBlock = 0;
  data.dbChartLastBlock = 0;
  data.blockCount = 1000;

  data.xData = [];
  data.xBlocknumber = [];
  data.xNumberOfBlocks = [];

  data.lastnumber = 0;
  data.datasets = [];
  data.datasets[0] = {
    "name": "BlockTime",
    "data": [],
    "unit": " s",
    "type": "line",
    "valueDecimals": 2
  };
  data.datasets[1] = {
    "name": "Difficulty",
    "data": [],
    "unit": " TH",
    "type": "area",
    "valueDecimals": 4
  };
  data.datasets[2] = {
    "name": "NetHashrate",
    "data": [],
    "unit": " GH/s",
    "type": "line",
    "valueDecimals": 2
  };
  data.datasets[3] = {
    "name": "Transactions",
    "data": [],
    "unit": " tx",
    "type": "area",
    "valueDecimals": 0
  };

  var client = redis.createClient();
  client.on("error", function (err) {
    console.log("Error ", err);
  });

  async.waterfall([
    function (callback) {
      client.hget(pre_fix.concat("lastblock"), "lastblock", function (err, result) {
        return callback(err, result);
      });
    },
    function (dbLastBlock, callback) {
      data.dbLastBlock = Number(dbLastBlock);
      client.hget(pre_fix_chart.concat("lastblock"), "lastblock", function (err, result) {
        return callback(err, result);
      });
    },
    function (dbChartLastBlock, callback) {
      data.dbChartLastBlock = Number(dbChartLastBlock);
      client.lrange(pre_fix_chart.concat("xData"), 0, -1, function (err, result) {
        return callback(err, result);
      });
    },
    function (xData, callback) {
      for (let i = 0; i < xData.length; i++) {
        data.xData.push(Number(xData[i]));
      }
      client.lrange(pre_fix_chart.concat("xBlocknumber"), 0, -1, function (err, result) {
        return callback(err, result);
      });
    },
    function (xBlocknumber, callback) {
      for (let i = 0; i < xBlocknumber.length; i++) {
        data.xBlocknumber.push(Number(xBlocknumber[i]));
      }
      client.lrange(pre_fix_chart.concat("xNumberOfBlocks"), 0, -1, function (err, result) {
        return callback(err, result);
      });
    },
    function (xNumberOfBlocks, callback) {
      for (let i = 0; i < xNumberOfBlocks.length; i++) {
        data.xNumberOfBlocks.push(Number(xNumberOfBlocks[i]));
      }
      client.lrange(pre_fix_chart.concat("BlockTime"), 0, -1, function (err, result) {
        return callback(err, result);
      });
    },
    function (datasets, callback) {
      for (let i = 0; i < datasets.length; i++) {
        data.datasets[0].data.push(Number(datasets[i]));
      }
      client.lrange(pre_fix_chart.concat("Difficulty"), 0, -1, function (err, result) {
        return callback(err, result);
      });
    },
    function (datasets, callback) {
      for (let i = 0; i < datasets.length; i++) {
        data.datasets[1].data.push(Number(datasets[i]));
      }
      client.lrange(pre_fix_chart.concat("NetHashrate"), 0, -1, function (err, result) {
        return callback(err, result);
      });
    },
    function (datasets, callback) {
      for (let i = 0; i < datasets.length; i++) {
        data.datasets[2].data.push(Number(datasets[i]));
      }
      client.lrange(pre_fix_chart.concat("Transactions"), 0, -1, function (err, result) {
        return callback(err, result);
      });
    },
    function (datasets, callback) {
      for (let i = 0; i < datasets.length; i++) {
        data.datasets[3].data.push(Number(datasets[i]));
      }

      data.blockCount = data.dbLastBlock - data.dbChartLastBlock;
      data.lastBlockTimes = 0;

      var cntDatasets = 0;
      if (data.blockCount > 0) {
        async.times(data.blockCount, function (n, next) {
          var field = data.dbChartLastBlock + n;
          if (field > 0) {
            var fieldkey = pre_fix.concat((field - (field % divide)) + ":").concat(field);
            client.hmget(fieldkey, 'timestamp', 'difficulty', 'number', 'transactions', function (err, block_info) {
              if (err || !block_info) {
                console.log(fieldkey + ": no block infomation");
                return next(err);
              } else {
                var baseOneTime = (60 * 60 * 1 * 1000);
                var baseTime = (60 * 60 * 2 * 1000);
                var hmgettimestamp = Number(block_info[0]) * 1000;
                var nowTime = new Date();
                var accNowTime = (nowTime - (nowTime % baseOneTime)) % baseTime == 0 ? (nowTime - (nowTime % baseOneTime)) - baseOneTime : (nowTime - (nowTime % baseOneTime));
                if (accNowTime > hmgettimestamp) {
                  var hmgetdifficulty = Number(block_info[1]);
                  var hmgettransactions = Number(block_info[3]);
                  var hmgetnumber = Number(block_info[2]);
                  if (data.lastBlockTimes > 0) {
                    var currentBlockTime = (hmgettimestamp - data.lastBlockTimes) / 1000;
                    var currentDifficulty = hmgetdifficulty;
                    var currentTransactions = hmgettransactions;
                    var perSixHour = (hmgettimestamp - (hmgettimestamp % baseOneTime)) % baseTime == 0 ? (hmgettimestamp - (hmgettimestamp % baseOneTime)) - baseOneTime : (hmgettimestamp - (hmgettimestamp % baseOneTime));
                    var idx = data.xData.indexOf(perSixHour);
                    //console.log("nowTime:", nowTime.toLocaleString(), "accNowTime:", (new Date(accNowTime)).toLocaleString(), "hmgettimestamp:", (new Date(hmgettimestamp)).toLocaleString(), "perSixHour:", (new Date(perSixHour)).toLocaleString());

                    if (idx == -1) {
                      cntDatasets = 1;
                      data.xData.push(perSixHour);
                      data.xBlocknumber.push(hmgetnumber);
                      data.xNumberOfBlocks.push(cntDatasets);
                      tmpData.BlockTime.push(currentBlockTime);
                      tmpData.Difficulty.push(currentDifficulty / 1000000000000);
                      tmpData.Transactions.push(currentTransactions);
                      console.log("hmgetnumber:", hmgetnumber, "hmgettimestamp:", (new Date(hmgettimestamp)).toLocaleString(), "perSixHour:", (new Date(perSixHour)).toLocaleString());
                      data.datasets[0].data.push(tmpData.BlockTime[data.xData.length - 1]);
                      data.datasets[1].data.push(tmpData.Difficulty[data.xData.length - 1]);
                      data.datasets[2].data.push((tmpData.Difficulty[data.xData.length - 1] / tmpData.BlockTime[data.xData.length - 1]) * 1000);
                      data.datasets[3].data.push(tmpData.Transactions[data.xData.length - 1]);

                      data.lastnumber = hmgetnumber;
                    } else {
                      cntDatasets++;
                      data.xData[idx] = perSixHour;
                      data.xBlocknumber[idx] = hmgetnumber;
                      data.xNumberOfBlocks[idx] = cntDatasets;

                      if (!tmpData.BlockTime[idx]) {
                        tmpData.BlockTime[idx] = currentBlockTime;
                      } else {
                        tmpData.BlockTime[idx] += currentBlockTime;
                      }
                      if (!tmpData.Difficulty[idx]) {
                        tmpData.Difficulty[idx] = currentDifficulty / 1000000000000;
                      } else {
                        tmpData.Difficulty[idx] += currentDifficulty / 1000000000000;
                      }
                      if (!tmpData.Transactions[idx]) {
                        tmpData.Transactions[idx] = currentTransactions;
                      } else {
                        tmpData.Transactions[idx] += currentTransactions;
                      }

                      data.datasets[0].data[idx] = tmpData.BlockTime[data.xData.length - 1] / cntDatasets;
                      data.datasets[1].data[idx] = tmpData.Difficulty[data.xData.length - 1] / cntDatasets;
                      data.datasets[2].data[idx] = (data.datasets[1].data[idx] / data.datasets[0].data[idx]) * 1000;
                      data.datasets[3].data[idx] = tmpData.Transactions[data.xData.length - 1];

                      data.lastnumber = hmgetnumber;
                    }
                  }
                }
                if (hmgettimestamp > 0) {
                  data.lastBlockTimes = hmgettimestamp;
                }
                next(err, block_info);
              }
            });
          } else {
            next(null, null);
          }
        }, function (err, blocks) {
          callback(err, blocks);
        });
      } else {
        callback("Not found block.", null);
      }
    }
  ], function (err, blocks) {
    if (err) {
      console.log("Error ", err);
      return next(err);
    } else {
      //1) combine the arrays:
      var list = [];
      for (let j = 0; j < data.xData.length; j++) {
        list.push({
          'xData': data.xData[j],
          'xBlocknumber': data.xBlocknumber[j],
          'xNumberOfBlocks': data.xNumberOfBlocks[j],
          'BlockTime': data.datasets[0].data[j],
          'Difficulty': data.datasets[1].data[j],
          'NetHashrate': data.datasets[2].data[j],
          'Transactions': data.datasets[3].data[j]
        });
      }

      //2) sort:
      list.sort(function (a, b) {
        return ((a.xData < b.xData) ? -1 : ((a.xData == b.xData) ? 0 : 1));
        //Sort could be modified to, for example, sort on the age
        // if the xData is the same.
      });

      //3) separate them back out:
      for (var k = 0; k < list.length; k++) {
        data.xData[k] = list[k].xData + (60 * 60 * 9 * 1000);
        data.xBlocknumber[k] = list[k].xBlocknumber;
        data.xNumberOfBlocks[k] = list[k].xNumberOfBlocks;
        data.datasets[0].data[k] = list[k].BlockTime;
        data.datasets[1].data[k] = list[k].Difficulty;
        data.datasets[2].data[k] = list[k].NetHashrate;
        data.datasets[3].data[k] = list[k].Transactions;
      }

      res.render('hashratechart', {
        xDataLength: JSON.stringify(data.xData.length + 1),
        xData: JSON.stringify(data.xData),
        xBlocknumber: JSON.stringify(data.xBlocknumber),
        xNumberOfBlocks: JSON.stringify(data.xNumberOfBlocks),
        BlockTime: JSON.stringify(data.datasets[0].data[k]),
        Difficulty: JSON.stringify(data.datasets[1].data[k]),
        NetHashrate: JSON.stringify(data.datasets[2].data[k]),
        Transactions: JSON.stringify(data.datasets[3].data[k]),
        activity: JSON.stringify(data),
        jsload_defer: config.jsload_defer,
        jsload_async: config.jsload_async
      });
    }
  });
});

module.exports = router;

function resultToJson(err, param) {
  var result = {};
  result.jsonrpc = 'esn';
  result.success = false;

  if (err) {
    result.result = err;
  } else if (param) {
    result.result = param;
    result.success = true;
  } else {
    result.result = NaN;
  }
  return result;
}