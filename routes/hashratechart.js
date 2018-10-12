var express = require('express');
var router = express.Router();
var events = require("events");
events.EventEmitter.prototype._maxListeners = 100;
var async = require('async');
var Web3 = require('web3');
const redis = require("redis");
const client = redis.createClient();
const pre_fix = 'explorerBlocks:';
const pre_fix_chart = 'explorerBlocksChart:';
const divide = 10000;

router.get('/', function (req, res, next) {
  var config = req.app.get('config');
  var web3 = new Web3();
  web3.setProvider(config.provider);
  var data = {};
  var tmpData = {};
  tmpData.BlockTime = [];
  tmpData.Difficulty = [];
  tmpData.NetHashrate = [];
  tmpData.Transactions = [];

  var dbSaveDatas = {};
  data.startTime = new Date();
  data.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
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

  client.on("error", function (err) {
    console.log("Error " + err);
  });

  async.waterfall([
    function (callback) {
      client.hget(pre_fix.concat("lastblock"), "lastblock", function (err, result) {
        data.dbLastBlock = Number(result);
        callback(err);
      });
    },
    function (callback) {
      client.hget(pre_fix_chart.concat("lastblock"), "lastblock", function (err, result) {
        data.dbChartLastBlock = Number(result);
        callback(err);
      });
    },
    function (callback) {
      client.lrange(pre_fix_chart.concat("xData"), 0, -1, function (err, result) {
        for (let i = 0; i < result.length; i++) {
          data.xData.push(Number(result[i]));
        }
        callback(err);
      });
    },
    function (callback) {
      client.lrange(pre_fix_chart.concat("xBlocknumber"), 0, -1, function (err, result) {
        for (let i = 0; i < result.length; i++) {
          data.xBlocknumber.push(Number(result[i]));
        }
        callback(err);
      });
    },
    function (callback) {
      client.lrange(pre_fix_chart.concat("xNumberOfBlocks"), 0, -1, function (err, result) {
        for (let i = 0; i < result.length; i++) {
          data.xNumberOfBlocks.push(Number(result[i]));
        }
        callback(err);
      });
    },
    function (callback) {
      client.lrange(pre_fix_chart.concat("BlockTime"), 0, -1, function (err, result) {
        for (let i = 0; i < result.length; i++) {
          data.datasets[0].data.push(Number(result[i]));
        }
        callback(err);
      });
    },
    function (callback) {
      client.lrange(pre_fix_chart.concat("Difficulty"), 0, -1, function (err, result) {
        for (let i = 0; i < result.length; i++) {
          data.datasets[1].data.push(Number(result[i]));
        }
        callback(err);
      });
    },
    function (callback) {
      client.lrange(pre_fix_chart.concat("NetHashrate"), 0, -1, function (err, result) {
        for (let i = 0; i < result.length; i++) {
          data.datasets[2].data.push(Number(result[i]));
        }
        callback(err);
      });
    },
    function (callback) {
      client.lrange(pre_fix_chart.concat("Transactions"), 0, -1, function (err, result) {
        for (let i = 0; i < result.length; i++) {
          data.datasets[3].data.push(Number(result[i]));
        }
        callback(err);
      });
    },
    function (callback) {
      data.blockCount = data.dbLastBlock - data.dbChartLastBlock;
      data.lastBlockTimes = 0;
      dbSaveDatas.xData = [];
      dbSaveDatas.BlockTime = [];
      dbSaveDatas.xBlocknumber = [];
      dbSaveDatas.xNumberOfBlocks = [];
      dbSaveDatas.Difficulty = [];
      dbSaveDatas.NetHashrate = [];
      dbSaveDatas.Transactions = [];

      var cntDatasets = 0;
      if (data.blockCount > 0) {
        async.times(data.blockCount, function (n, next) {
          //async.times(10000, function (n, next) {
          var field = data.dbChartLastBlock + n;
          if (field > 0) {
            var fieldkey = pre_fix.concat((field - (field % divide)) + ":").concat(field);
            client.hmget(fieldkey, 'timestamp', 'difficulty', 'number', 'transactions', function (err, block_info) {
              if (err || !block_info) {
                console.log(fieldkey + ": no block infomation");
                next(err, null);
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
                      dbSaveDatas.xData.push(perSixHour);
                      dbSaveDatas.xBlocknumber.push(hmgetnumber);
                      dbSaveDatas.xNumberOfBlocks.push(cntDatasets);
                      dbSaveDatas.BlockTime.push(tmpData.BlockTime[data.xData.length - 1]);
                      dbSaveDatas.Difficulty.push(tmpData.Difficulty[data.xData.length - 1]);
                      dbSaveDatas.NetHashrate.push((tmpData.Difficulty[data.xData.length - 1] / tmpData.BlockTime[data.xData.length - 1]) * 1000);
                      dbSaveDatas.Transactions.push(tmpData.Transactions[data.xData.length - 1]);
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
                      var dbsaveIdx = dbSaveDatas.xData.indexOf(perSixHour);
                      dbSaveDatas.xData[dbsaveIdx] = perSixHour;
                      dbSaveDatas.xBlocknumber[dbsaveIdx] = hmgetnumber;
                      dbSaveDatas.xNumberOfBlocks[dbsaveIdx] = cntDatasets;
                      dbSaveDatas.BlockTime[dbsaveIdx] = tmpData.BlockTime[data.xData.length - 1] / cntDatasets;
                      dbSaveDatas.Difficulty[dbsaveIdx] = tmpData.Difficulty[data.xData.length - 1] / cntDatasets;
                      dbSaveDatas.NetHashrate[dbsaveIdx] = (data.datasets[1].data[idx] / data.datasets[0].data[idx]) * 1000;
                      dbSaveDatas.Transactions[dbsaveIdx] = tmpData.Transactions[data.xData.length - 1];
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
        callback(err, null);
      }
    }
  ], function (err, blocks) {
    if (err) {
      console.log("Error " + err);
    }

    var multi = client.multi();
    if (data.lastnumber > 0) {
      multi.hset(pre_fix_chart.concat("lastblock"), "lastblock", data.lastnumber);
    }
    for (let i = 0; i < dbSaveDatas.xData.length; i++) {
      multi.rpush(pre_fix_chart.concat('xData'), dbSaveDatas.xData[i]);
      multi.rpush(pre_fix_chart.concat('xBlocknumber'), dbSaveDatas.xBlocknumber[i]);
      multi.rpush(pre_fix_chart.concat('xNumberOfBlocks'), dbSaveDatas.xNumberOfBlocks[i]);
      multi.rpush(pre_fix_chart.concat('BlockTime'), dbSaveDatas.BlockTime[i]);
      multi.rpush(pre_fix_chart.concat('Difficulty'), dbSaveDatas.Difficulty[i]);
      multi.rpush(pre_fix_chart.concat('NetHashrate'), dbSaveDatas.NetHashrate[i]);
      multi.rpush(pre_fix_chart.concat('Transactions'), dbSaveDatas.Transactions[i]);
    }
    multi.exec(function (errors, results) {
      if (errors) {
        console.log(errors);
      }
    });
    dbSaveDatas = null;

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
    /*
    console.log("final data.xData: " + data.xData.length);
    console.log("final data.xBlocknumber: " + data.xBlocknumber.length);
    console.log("final data.xNumberOfBlocks: " + data.xNumberOfBlocks.length);
    console.log("final data.datasets[0].data: " + data.datasets[0].data.length);
    console.log("final data.datasets[1].data: " + data.datasets[1].data.length);
    console.log("final data.datasets[2].data: " + data.datasets[2].data.length);
    */
    res.render('hashratechart', {
      xDataLength: JSON.stringify(data.xData.length + 1),
      xData: JSON.stringify(data.xData),
      xBlocknumber: JSON.stringify(data.xBlocknumber),
      xNumberOfBlocks: JSON.stringify(data.xNumberOfBlocks),
      BlockTime: JSON.stringify(data.datasets[0].data[k]),
      Difficulty: JSON.stringify(data.datasets[1].data[k]),
      NetHashrate: JSON.stringify(data.datasets[2].data[k]),
      Transactions: JSON.stringify(data.datasets[3].data[k]),
      activity: JSON.stringify(data)
    });
    data = null;
    tmpData = null;
    dbSaveDatas = null;
    multi = null;
    list = null;
    web3 = null;
  });
});

module.exports = router;