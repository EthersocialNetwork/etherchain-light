var express = require('express');
var router = express.Router();

var async = require('async');
const redis = require("redis");
const pre_fix = 'explorerBlocks:';
const pre_fix_chart = 'explorerBlocksChart:';

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

  data.totalTxCount = 0;

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
        data.totalTxCount += Number(datasets[i]);
        data.datasets[3].data.push(Number(datasets[i]));
      }
      callback(null);
    }
  ], function (err) {
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
        data.xData[k] = list[k].xData;
        data.xBlocknumber[k] = list[k].xBlocknumber;
        data.xNumberOfBlocks[k] = list[k].xNumberOfBlocks;
        data.datasets[0].data[k] = list[k].BlockTime;
        data.datasets[1].data[k] = list[k].Difficulty;
        data.datasets[2].data[k] = list[k].NetHashrate;
        data.datasets[3].data[k] = list[k].Transactions;
      }

      res.render('hashratechart', {
        xDataLength: JSON.stringify(data.xData.length + 1),
        activity: data,
        jsload_defer: config.jsload_defer,
        jsload_async: config.jsload_async,
        totalTxCount: data.totalTxCount
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