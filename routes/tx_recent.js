var express = require('express');
var router = express.Router();
var async = require('async');

const configConstant = require('../config/configConstant');
const configNames = require('../config/configNames.js');

var Redis = require('ioredis');
var redis = new Redis(configConstant.redisConnectString);

var BigNumber = require('bignumber.js');
BigNumber.config({
  DECIMAL_PLACES: 8
});

const pre_fix_tx = 'explorerTransactions:';

router.all('/transactions/:query', function (req, res, next) {
  data = {};
  data.count = parseInt(req.body.length);
  data.start = parseInt(req.body.start);
  data.draw = parseInt(req.body.draw);

  async.waterfall([
      function (callback) {
        redis.zcard(pre_fix_tx.concat("list"), function (err, result) {
          return callback(err, result);
        });
      },
      function (zcard, callback) {
        var start = data.start;
        var end = start + data.count - 1;
        redis.zrevrange(pre_fix_tx.concat("list"), start, end, function (err, result) {
          return callback(err, zcard, result);
        });
      },
      function (zcard, txhashlist, callback) {
        var txList = [];
        async.eachSeries(txhashlist, function (tx, txEachCallback) {
          redis.hmget(pre_fix_tx.concat(tx), 'transactionHash', 'blockNumber', 'date', 'type', 'from', 'to', 'transactionPosition', 'value', 'isContract', 'token_symbol', 'token_decimals', '_value', '_to', 'blockHash', 'author', 'rewardType',
            function (err, txInfoArray) {
              //0'transactionHash', 1'blockNumber', 2'date', 3'type', 4'from', 5'to', 6'transactionPosition', 7'value', 8'isContract',
              //9'token_symbol', 10'token_decimals', 11'_value', 12'_to', 13'blockHash', 14'author', 15'rewardType'
              var type = txInfoArray[3];
              var txInfo = [];
              if (type == 'reward') {
                txInfo[0] = txInfoArray[13];
                txInfo[1] = txInfoArray[1];
                txInfo[2] = printDateTime(parseInt(txInfoArray[2], 16) * 1000);
                if (txInfoArray[15] == "uncle") {
                  txInfo[3] = "Uncle";
                } else {
                  txInfo[3] = "Mining";
                }
                txInfo[4] = "New Coins Mining Reward";
                txInfo[5] = address2href(txInfoArray[14]);

                let Ether = new BigNumber(10e+17);
                let ret = new BigNumber(txInfoArray[7]);
                txInfo[6] = ret.dividedBy(Ether).toFormat(8).concat(' ESN');
                //txInfo[7] = txInfoArray[8];
              } else {
                txInfo[0] = txInfoArray[0];
                txInfo[1] = txInfoArray[1];
                txInfo[2] = printDateTime(parseInt(txInfoArray[2], 16) * 1000);
                txInfo[3] = txInfoArray[3];
                txInfo[4] = address2href(txInfoArray[4]);

                var address5 = txInfoArray[5];
                if (txInfoArray[12] != '') {
                  address5 = txInfoArray[12];
                }
                txInfo[5] = address2href(address5);

                if (txInfoArray[11] != '') {
                  //console.log('[9]', txInfoArray[9], '[10]', txInfoArray[10], '[11]', txInfoArray[11]);
                  let Ether = new BigNumber(Math.pow(10, parseInt(txInfoArray[10] == '' ? '0' : txInfoArray[10])));
                  let ret = new BigNumber(txInfoArray[11]);
                  txInfo[6] = ret.dividedBy(Ether).toFormat(8).concat(' ').concat(txInfoArray[9]);
                } else {
                  let Ether = new BigNumber(10e+17);
                  let ret = new BigNumber(txInfoArray[7]);
                  txInfo[6] = ret.dividedBy(Ether).toFormat(8).concat(' ESN');
                }
                //txInfo[7] = txInfoArray[8];
              }
              txList.push(txInfo);
              txEachCallback(err);
            });
        }, function (err) {
          callback(err, zcard, txList);
        });
      }
    ],
    function (err, zcard, txInfoList) {
      if (err) {
        console.log("Final Error ", err);
        return next(err);
      } else {
        var jsonData = {
          "draw": data.draw,
          "recordsTotal": zcard,
          "recordsFiltered": zcard, //txInfoList.length,
          "data": txInfoList
        };
        res.json(jsonData);
      }
    });
});

router.get('/', function (req, res, next) {
  res.render('tx_recent');
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