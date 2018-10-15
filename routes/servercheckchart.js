var express = require('express');
var router = express.Router();
var async = require('async');
const redis = require("redis");
const client = redis.createClient();
const pre_fix = 'PortCheck:';

router.get('/', function (req, res, next) {
  var data = {};
  data.chartdata = {};
  var serverPortCheckList = req.app.get('serverPortCheckList');
  for (var i = 0; i < serverPortCheckList.length; i++) {
    data.chartdata[serverPortCheckList[i]] = {};
  }

  client.on("error", function (err) {
    console.log("Error " + err);
  });


  async.eachOfSeries(serverPortCheckList, function (value, key, callback) {
    client.hgetall(pre_fix.concat(value), function (err, replies) {
      if (err) return callback(err);
    
      const ordered = {};
      Object.keys(replies).sort().forEach(function(key) {
        ordered[key] = replies[key];
      });

      for (var reply in ordered) {
        if (!data.chartdata[serverPortCheckList[key]].series) {
          data.chartdata[serverPortCheckList[key]].series = [];
        }
        data.chartdata[serverPortCheckList[key]].series.push([reply, ordered[reply]]);
      }
      callback();
    });
  }, function (err) {
    if (err) {
      console.log(err);
    } else {
      //console.dir(data);
      res.render('servercheckchart', {
        activity: JSON.stringify(data)
      });
    }
  });
});

module.exports = router;