var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');

var async = require('async');
var Web3 = require('web3');
var redis = require("redis"),
	client = redis.createClient();

router.get('/:offset?', function (req, res, next) {
	var config = req.app.get('config');
	var web3 = new Web3();
	var Ether = new BigNumber(10e+17);
	web3.setProvider(config.provider);
	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	var multi = client.multi();
	var data = "";
	var cnt = 0;
	var allcnt = 0;
	var nowcnt = 0;

	client.on("error", function (err) {
		console.log("Error " + err);
	});
	if (ip != "115.68.0.74") {
		res.render("top100_settingup", {
			"printdatetime": ("현재 시간: " + printDateTime()),
			"lastaccount": "0x0000000000000000000000000000000000000000",
			"addcount": "0",
			"allcnt": "0"
		});
	} else {
		async.waterfall([
			function (callback) {
				client.hget('esn_top100:lastaccount', 'nowcount', function (err, result) {
					if (result != null && result != "Nan") {
						nowcnt = parseInt(result);
					}
				});
				client.hget('esn_top100:lastaccount', 'count', function (err, result) {
					if (result != null && result != "Nan") {
						allcnt = parseInt(result);
					}
					return callback(err);
				});
			},
			function (callback) {
				client.hget('esn_top100:lastaccount', 'address', function (err, result) {
					return callback(err, result);
				});
			},
			function (lastaccount, callback) {
				console.log("esn_top100:lastaccount:", lastaccount);
				web3.parity.listAccounts(50000, lastaccount, function (err, result) {
					return callback(err, result);
				});
			},
			function (accounts, callback) {
				if (!accounts) {
					return callback({
						name: "FatDBDisabled",
						message: "Parity FatDB system is not enabled. Please restart Parity with the --fat-db=on parameter."
					});
				}
				if (accounts.length < 1) {
					nowcnt = 0;
					web3.parity.listAccounts(200000, null, function (err, result) {
						return callback(err, result);
					});
				} else {
					return callback(null, accounts);
				}
			},
			function (accounts, callback) {
				async.eachSeries(accounts, function (account, eachCallback) {
					data = account;
					web3.eth.getBalance(account, function (err, balance) {
						if (err) {
							return eachCallback(err);
						}
						var numBalance = new BigNumber(balance);
						numBalance = numBalance.dividedBy(Ether);
						nowcnt++;
						if (numBalance >= 0.00000001) {
							cnt++;
							multi.zadd('esn_top100', numBalance.toString(), account);
						}
						return eachCallback();
					});
				}, function (err) {
					return callback(err, "완료 시간: " + printDateTime(), data, cnt, allcnt, nowcnt);
				});
			}
		], function (err, printdatetime, resaccount, rescount, resallcount, nowcount) {
			if (err) {
				console.log("Error " + err);
			}

			multi.hset('esn_top100:createtime', 'datetime', printDateTime());
			if (resallcount < nowcount) {
				multi.hset('esn_top100:lastaccount', 'count', nowcount);
			}
			multi.hset('esn_top100:lastaccount', 'nowcount', nowcount);
			if (resaccount != "") {
				multi.hset('esn_top100:lastaccount', 'address', resaccount);
			}

			multi.exec(function (errors, results) {
				if (errors) {
					console.log(errors);
				}
			});
			multi = null;

			res.render("top100_settingup", {
				"printdatetime": printdatetime,
				"lastaccount": resaccount,
				"addcount": rescount,
				"allcount": resallcount
			});
			web3 = null;
		});
	}
});

module.exports = router;

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