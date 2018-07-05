var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');

var async = require('async');
var Web3 = require('web3');
var redis = require("redis"),
client = redis.createClient();

router.get('/:offset?', function(req, res, next) {
	var config = req.app.get('config');  
	var web3 = new Web3();
	var Ether     = new BigNumber(10e+17);
	web3.setProvider(config.provider);

	client.on("error", function (err) {
		console.log("Error " + err);
	});

	async.waterfall([
		function(callback) {
			web3.parity.listAccounts(1000000, req.params.offset, function(err, result) {
				callback(err, result);
			});
		}, 
		function(accounts, callback) {
			client.del('esn_top100');

			if (!accounts) {
				return callback({name:"FatDBDisabled", message: "Parity FatDB system is not enabled. Please restart Parity with the --fat-db=on parameter."});
			}
			if (accounts.length === 0) {
				return callback({name:"NoAccountsFound", message: "Chain contains no accounts."});
			}
			async.eachSeries(accounts, function(account, eachCallback) {
				web3.eth.getCode(account, function(err, code) {
					if (err) {
						return eachCallback(err);
					}
					web3.eth.getBalance(account, function(err, balance) {
						if (err) {
							return eachCallback(err);
						}
						var numBalance = new BigNumber(balance);
						numBalance = numBalance.dividedBy(Ether);
						if(code.length < 3 && numBalance > 0) {
							client.zadd('esn_top100',numBalance.toString(),account);
						}
						eachCallback();
					});
				});
			}, function(err) {
				callback(err, "완료 시간: " + printDateTime());
			});
			client.zadd('esn_top100','2100000000', printDateTime());
		}
	], function(err, printdatetime) {
		if (err) {
			return next(err);
		}
		res.render("top100_settingup", { "printdatetime": printdatetime });
	});
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
	var calendar = currentDate.getFullYear() + "-" + addZeros((currentDate.getMonth()+1).toString(),2) + "-" + addZeros(currentDate.getDate().toString(),2);
	var currentHours = addZeros(currentDate.getHours(),2); 
	var currentMinute = addZeros(currentDate.getMinutes(),2);
	var currentSeconds =  addZeros(currentDate.getSeconds(),2);
	return calendar +" "+currentHours+":"+currentMinute+":"+currentSeconds;
}