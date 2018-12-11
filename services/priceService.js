const async = require('async');

const configConstant = require('../config/configConstant');
var BigNumber = require('bignumber.js');
var getJSON = require('get-json');
var request = require('request');
var Redis = require('ioredis');
var redis = new Redis(configConstant.redisConnectString);

var prices = function () {
	async.forever(
		function (next) {
			console.log("[▷▷▷ Start ▷▷▷][PricesService]", printDateTime());
			var data = {};
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
					if (coinrate) {
						if (data.bitzTimeoutCoinrate && coinrate.status == 200) {
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
					}
					callback(null);
				}
			], function (err) {
				if (err) {
					console.log("Error ", err);
				}
				console.log("[□□□□ End □□□□][PriceService]", printDateTime());
				setTimeout(function () {
					next();
				}, configConstant.PriceServiceInterval);
			});
		},
		function (err) {
			console.log('!!!! PriceService STOP !!!!', err);
		}
	);
};

module.exports = prices;

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

function printDateTime() {
	var currentDate = new Date();
	var calendar = currentDate.getFullYear() + "-" + addZeros((currentDate.getMonth() + 1).toString(), 2) + "-" + addZeros(currentDate.getDate().toString(), 2);
	var currentHours = addZeros(currentDate.getHours(), 2);
	var currentMinute = addZeros(currentDate.getMinutes(), 2);
	var currentSeconds = addZeros(currentDate.getSeconds(), 2);
	return calendar + " " + currentHours + ":" + currentMinute + ":" + currentSeconds;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}