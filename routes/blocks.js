var express = require('express');
var router = express.Router();
var async = require('async');

const configConstant = require('../config/configConstant');
const configNames = require('../config/configNames.js');

var Redis = require('ioredis');
var redis = new Redis(configConstant.redisConnectString);

var _ = require('underscore');

const pre_fix = 'explorerBlocks:';
const divide = 10000;

router.all('/:query', function (req, res, next) {
  data = {};
  data.count = parseInt(req.body.length);
  data.start = parseInt(req.body.start);
  data.draw = parseInt(req.body.draw);

  async.waterfall([
      function (callback) {
        var start = data.start;
        var end = start + data.count - 1;
        redis.zrevrange(pre_fix.concat("list"), start, end, 'WITHSCORES', function (err, result) {
          var lists = _.groupBy(result, function (a, b) {
            return Math.floor(b / 2);
          });
          return callback(err, _.toArray(lists));
        });
      },
      function (blocklist, callback) {
        var blockList = []; //[ [ 'blockhash', 'blocknumber' ], [ 'blockhash', 'blocknumber' ], [ 'blockhash', 'blocknumber' ] ]
        async.eachSeries(blocklist, function (block, blockEachCallback) {
          var blockhash = block[0];
          var blocknumber = block[1];

          var rds_key = pre_fix.concat((blocknumber - (blocknumber % divide)) + ":").concat(blocknumber);
          redis.hmget(rds_key, 'number', 'timestamp', 'hash', 'miner', 'transactions', 'uncles',
            function (err, blockInfoArray) {
              //0'number', 1'timestamp', 2'hash', 3'miner', 4'transactions', 5'uncles'
              blockInfoArray[1] = printDateTime(parseInt(blockInfoArray[1], 16) * 1000);
              blockInfoArray[3] = address2href(blockInfoArray[3]);

              blockList.push(blockInfoArray);
              blockEachCallback(err);
            });
        }, function (err) {
          callback(err, blockList);
        });
      },
      function (blockList, callback) {
        redis.zcard(pre_fix.concat("list"), function (err, result) {
          return callback(err, result, blockList);
        });
      }
    ],
    function (err, zcard, blockInfoList) {
      if (err) {
        console.log("Final Error ", err);
        return next(err);
      } else {
        var jsonData = {
          "draw": data.draw,
          "recordsTotal": zcard,
          "recordsFiltered": zcard, //blockInfoList.length,
          "data": blockInfoList
        };
        res.json(jsonData);
      }
    });
});

router.get('/', function (req, res, next) {
  res.render('blocks');
});

function address2href(address) {
  var name = configNames.names[address] ? ((configNames.names[address]).split("/"))[0] : configNames.holdnames[address] ? (('Long-term holding: '.concat(configNames.holdnames[address])).split("/"))[0] : address.substr(0, 20).concat('...');
  return '<a href="/account/'.concat(address).concat('">').concat(name).concat('</a>');
}

function addZeros(num, digit) {
  var zero = '';
  num = num.toString();
  if (num.length < digit) {
    for (i = 0; i < digit - num.length; i++) {
      zero += '0';
    }
  }
  return zero + num.toString();
}

function printDateTime(mstime) {
  var currentDate = new Date(mstime);
  var calendar = currentDate.getFullYear().toString().substr(-2) + "/" + addZeros((currentDate.getMonth() + 1).toString(), 2) + "/" + addZeros(currentDate.getDate().toString(), 2);
  var currentHours = addZeros(currentDate.getHours(), 2);
  var currentMinute = addZeros(currentDate.getMinutes(), 2);
  var currentSeconds = addZeros(currentDate.getSeconds(), 2);
  return calendar + " " + currentHours + ":" + currentMinute + ":" + currentSeconds;
}

module.exports = router;