var express = require('express');
var router = express.Router();
var getJSON = require('get-json');
var curl = require('curl');
var BigNumber = require('bignumber.js');
var request = require('request');

var async = require('async');
const redis = require("redis");
const client = redis.createClient();
const pre_fix = 'exchage_prices:';

/*
https://www.bit-z.com/
https://www.cashierest.com/
https://coinone.co.kr/
https://www.korbit.co.kr/
https://www.bimax.io/
*/
router.get('/', function (req, res, next) {
  client.on("error", function (err) {
    console.log("Error ", err);
  });

  var data = {};
  data.bitz = {};
  data.bitz.timeoutTicker = false;
  data.cashierest = {};
  data.cashierest.timeoutTicker = false;
  data.coinone = {};
  data.coinone.timeoutTicker = false;
  data.bimax = {};
  data.bimax.timeoutTicker = false;

  async.waterfall([
      //bimax 시작
      function (callback) {
        client.hgetall(pre_fix.concat('bimax'), function (err, result) {
          return callback(err, result);
        });
      },
      function (ticker, callback) {
        if (ticker) {
          data.bimax = ticker;
        }
        var now = new Date();
        if (!ticker || ticker.time < now.getTime() - (1000 * 60)) {
          data.bimax.timeoutTicker = true;

          var headers = {
            'Origin': 'https://www.bimax.io',
            //'Accept-Encoding': 'gzip, deflate, br',
            //'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36',
            //'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            //'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': 'https://www.bimax.io/trade',
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
            return callback(error, body);
          });
        } else {
          return callback(null, null);
        }
      },
      function (bodyText, callback) {
        if (data.bimax.timeoutTicker && bodyText != null) {
          var ticker = JSON.parse(bodyText.trim());
          var tickerall = ticker.data;
          var ret = new BigNumber(0);
          for (var key in tickerall) {
            if (tickerall.hasOwnProperty(key)) {
              ret = new BigNumber(tickerall[key].nowPrice);

              if (key == "BTC/KRW") {
                data.bimax.BTC = ret.toFormat(2);
              } else if (key == "ETH/KRW") {
                data.bimax.ETH = ret.toFormat(2);
              } else if (key == "LTC/KRW") {
                data.bimax.LTC = ret.toFormat(2);
              } else if (key == "ESN/KRW") {
                data.bimax.ESN = ret.toFormat(2);
              }
            }
          }
          var now = new Date();
          data.bimax.time = now.getTime();
          client.hmset(pre_fix.concat('bimax'), data.bimax);
        }
        return callback(null);
      },
      //bimax 종료
      //coinone 시작
      function (callback) {
        client.hgetall(pre_fix.concat('coinone'), function (err, result) {
          return callback(err, result);
        });
      },
      function (ticker, callback) {
        if (ticker) {
          data.coinone = ticker;
        }
        var now = new Date();
        if (!ticker || ticker.time < now.getTime() - (1000 * 60)) {
          data.coinone.timeoutTicker = true;

          getJSON('https://api.coinone.co.kr/ticker/?currency=all&format=json', function (error, response) {
            return callback(error, response);
          });
        } else {
          return callback(null, null);
        }
      },
      function (tickerall, callback) {
        if (data.coinone.timeoutTicker && tickerall != null) {
          var ret = new BigNumber(0);
          for (var key in tickerall) {
            if (tickerall.hasOwnProperty(key)) {
              ret = new BigNumber(tickerall[key].last);
              if (key == "btc") {
                data.coinone.BTC = ret.toFormat(2);
              } else if (key == "eth") {
                data.coinone.ETH = ret.toFormat(2);
              } else if (key == "etc") {
                data.coinone.ETC = ret.toFormat(2);
              } else if (key == "ltc") {
                data.coinone.LTC = ret.toFormat(2);
              } else if (key == "eos") {
                data.coinone.EOS = ret.toFormat(2);
              } else if (key == "qtum") {
                data.coinone.QTUM = ret.toFormat(2);
              } else if (key == "bch") {
                data.coinone.BCH = ret.toFormat(2);
              }
            }
          }
          var now = new Date();
          data.coinone.time = now.getTime();
          client.hmset(pre_fix.concat('coinone'), data.coinone);
        }
        return callback(null);
      },
      //coinone 종료
      //cashierest 시작
      function (callback) {
        client.hgetall(pre_fix.concat('cashierest'), function (err, result) {
          return callback(err, result);
        });
      },
      function (ticker, callback) {
        if (ticker) {
          data.cashierest = ticker;
        }
        var now = new Date();
        if (!ticker || ticker.time < now.getTime() - (1000 * 60)) {
          data.cashierest.timeoutTicker = true;

          curl.get('https://rest.cashierest.com/public/tickerall', null, function (err, response, body) {
            return callback(err, body);
          });
        } else {
          return callback(null, null);
        }
      },
      function (bodyText, callback) {
        if (data.cashierest.timeoutTicker && bodyText != null) {
          var ticker = JSON.parse(bodyText.trim());
          var tickerall = ticker.Cashierest;
          var ret = new BigNumber(0);
          for (var key in tickerall) {
            if (tickerall.hasOwnProperty(key)) {
              ret = new BigNumber(tickerall[key].last);
              if (key == "KRW_BTC") {
                data.cashierest.BTC = ret.toFormat(2);
              } else if (key == "KRW_ETH") {
                data.cashierest.ETH = ret.toFormat(2);
              } else if (key == "KRW_EOS") {
                data.cashierest.EOS = ret.toFormat(2);
              } else if (key == "KRW_DASH") {
                data.cashierest.DASH = ret.toFormat(2);
              } else if (key == "KRW_TRX") {
                data.cashierest.TRX = ret.toFormat(2);
              } else if (key == "KRW_INC") {
                data.cashierest.INC = ret.toFormat(2);
              } else if (key == "KRW_NPXS") {
                data.cashierest.NPXS = ret.toFormat(2);
              } else if (key == "KRW_TUSD") {
                data.cashierest.TUSD = ret.toFormat(2);
              } else if (key == "KRW_BCH") {
                data.cashierest.BCH = ret.toFormat(2);
              }
            }
          }
          var now = new Date();
          data.cashierest.time = now.getTime();
          client.hmset(pre_fix.concat('cashierest'), data.cashierest);
        }
        return callback(null);
      },
      //cashierest 종료
      //bit-z 시작
      function (callback) {
        client.hgetall(pre_fix.concat('bit-z'), function (err, result) {
          return callback(err, result);
        });
      },
      function (ticker, callback) {
        if (ticker) {
          data.bitz = ticker;
        }
        var now = new Date();
        if (!ticker || ticker.time * 1000 < now.getTime() - (1000 * 60)) {
          data.bitz.timeoutTicker = true;
          getJSON('https://apiv2.bitz.com/Market/tickerall', function (error, response) {
            return callback(error, response);
          });
        } else {
          return callback(null, null);
        }
      },
      function (ticker, callback) {
        if (data.bitz.timeoutTicker && ticker != null && ticker.status == 200) {
          var tickerall = ticker.data;
          var ret = new BigNumber(0);
          for (var key in tickerall) {
            if (tickerall.hasOwnProperty(key)) {
              ret = new BigNumber(tickerall[key].krw);
              if (key == "btc_usdt") {
                data.bitz.BTC = ret.toFormat(2);
              } else if (key == "eth_btc") {
                data.bitz.ETH = ret.toFormat(2);
              } else if (key == "etc_btc") {
                data.bitz.ETC = ret.toFormat(2);
              } else if (key == "ltc_btc") {
                data.bitz.LTC = ret.toFormat(2);
              } else if (key == "eos_btc") {
                data.bitz.EOS = ret.toFormat(2);
              } else if (key == "esn_btc") {
                data.bitz.ESN = ret.toFormat(2);
              } else if (key == "dash_btc") {
                data.bitz.DASH = ret.toFormat(2);
              } else if (key == "qtum_btc") {
                data.bitz.QTUM = ret.toFormat(2);
              } else if (key == "trx_btc") {
                data.bitz.TRX = ret.toFormat(2);
              } else if (key == "inc_btc") {
                data.bitz.INC = ret.toFormat(2);
              } else if (key == "npxs_btc") {
                data.bitz.NPXS = ret.toFormat(2);
              } else if (key == "tusd_btc") {
                data.bitz.TUSD = ret.toFormat(2);
              } else if (key == "bch_btc") {
                data.bitz.BCH = ret.toFormat(2);
              }
            }
          }
          data.bitz.time = ticker.time;
          client.hmset(pre_fix.concat('bit-z'), data.bitz);
        }
        return callback(null);
      }
    ],
    function (err) {
      if (err) {
        console.log("[Error][Prices]", err);
        return next(err);
      }

      res.render('prices', {
        bitz: data.bitz,
        cashierest: data.cashierest,
        coinone: data.coinone,
        bimax: data.bimax
      });
    });

});

module.exports = router;