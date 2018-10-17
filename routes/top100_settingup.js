var express = require('express');
var router = express.Router();
var BigNumber = require('bignumber.js');

var async = require('async');
var Web3 = require('web3');
var redis = require("redis"),
	client = redis.createClient();

router.get('/:offset?', function (req, res, next) {
	console.log("--------- Top100 Settingup Start: ", printDateTime(), "--------- ");
	var config = req.app.get('config');
	var configERC20 = req.app.get('configERC20');
	var web3 = new Web3();
	var Ether = new BigNumber(10e+17);
	web3.setProvider(config.selectParity());
	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	var data = "";
	var cnt = 0;
	var allcnt = 0;
	var nowcnt = 0;
	var tokenExporter = req.app.get('tokenExporter');

	console.log(tokenExporter);

	// IP 주소에 콜론(:)이 있는 경우 맨 마지막 값을 IP주소로 지정
	if(ip.indexOf(':') >= 0) {
        var ipDatas = ip.split(":");
        if(ipDatas.length > 0)  ip = ipDatas[ipDatas.length - 1];
    }

	client.on("error", function (err) {
		console.log("Error " + err);
	});
	if (ip != config.cronIP) {
		console.log(ip, config.cronIP);
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
					return callback(err, result);
				});
			},
			function (pnowcnt, callback) {
				if (pnowcnt != null && pnowcnt != "Nan") {
					nowcnt = parseInt(pnowcnt);
				}
				client.hget('esn_top100:lastaccount', 'count', function (err, result) {
					return callback(err, result);
				});
			},
			function (pallcnt, callback) {
				if (pallcnt != null && pallcnt != "Nan") {
					allcnt = parseInt(pallcnt);
				}
				client.hget('esn_top100:lastaccount', 'address', function (err, result) {
					return callback(err, result);
				});
			},
			function (lastaccount, callback) {
				console.log("esn_top100:lastaccount:", lastaccount);
				web3.parity.listAccounts(5000, lastaccount, function (err, result) {
					callback(err, result);
				});
			},
			function (accounts, callback) {
				if (!accounts) {
					callback({
						name: "FatDBDisabled",
						message: "Parity FatDB system is not enabled. Please restart Parity with the --fat-db=on parameter."
					});
				} else {
					if (accounts.length < 1) {
						nowcnt = 0;
						web3.parity.listAccounts(10000, null, function (err, result) {
							callback(err, result);
						});
					} else {
						callback(null, accounts);
					}
				}
			},
			function (accounts, callback) { //balance batch 시작
				var batch = web3.createBatch();
				async.eachSeries(accounts, function (account, batchAddEachCallback) {
					batch.add(web3.eth.getBalance.request(account));
					batchAddEachCallback();
				}, function (err) {
					callback(err, batch);
				});
			},
			function (batchAdded, callback) {
				batchAdded.requestManager.sendBatch(batchAdded.requests, function (err, results) {
					if (err) {
						callback(err, null);
					} else {
						callback(null, batchAdded.requests, results);
					}
				});
			},
			function (requests, balances, callback) {
				var accountBalances = {};
				async.eachOfSeries(requests, function (value, key, requestsEachCallback) {
					accountBalances[value.params[0]] = balances[key].result;
					requestsEachCallback();
				}, function (err) {
					if (err) {
						console.log("[ERROR] batchResults: ", err);
					}
					callback(null, accountBalances);
				});
			}, //balance batch 종료

			function (accountBalances, callback) {
				var batch = web3.createBatch();
				async.eachSeries(Object.keys(accountBalances), function (account, batchAddEachCallback) {
					batch.add(web3.eth.getCode.request(account));
					batchAddEachCallback();
				}, function (err) {
					callback(err, batch, accountBalances);
				});
			},
			function (batchAdded, accountBalances, callback) {
				batchAdded.requestManager.sendBatch(batchAdded.requests, function (err, results) {
					if (err) {
						callback(err, null);
					} else {
						callback(null, batchAdded.requests, results, accountBalances);
					}
				});
			},
			function (requests, codes, accountBalances, callback) {
				/*
				[ { method: 'eth_getCode',
					params: [ '0xe3ec5ebd3e822c972d802a0ee4e0ec080b8237ba', 'latest' ],
					callback: undefined,
					format: [Function: bound ] },
				{ method: 'eth_getCode',
					params: [ '0x2930822031420731f09dce572554a8b8c1eaa09b', 'latest' ],
					callback: undefined,
					format: [Function: bound ] },
				{ method: 'eth_getCode',
					params: [ '0x0146b9dcd9fb2abc1b5b136c28d20d0037526961', 'latest' ],
					callback: undefined,
					format: [Function: bound ] } ]
				[ { jsonrpc: '2.0', result: '0x', id: 5098 },
				{ jsonrpc: '2.0', result: '0x', id: 5099 },
				{ jsonrpc: '2.0',
					result:
					'0x6060604052600436106100da5763ffffffff7c010000000000000000000000000000000000000000000000000000000060003504166306fdde0381146100df578063095ea7b31461016957806318160ddd1461019f57806323b872dd146101c4578063313ce567146101ec57806342966c681461021557806370a082311461022b57806379c650681461024a57806379cc67901461026e5780638da5cb5b1461029057806395d89b41146102bf578063a9059cbb146102d2578063cae9ca51146102f4578063dd62ed3e14610359578063f2fde38b1461037e575b600080fd5b34156100ea57600080fd5b6100f261039d565b60405160208082528190810183818151815260200191508051906020019080838360005b8381101561012e578082015183820152602001610116565b50505050905090810190601f16801561015b5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b341561017457600080fd5b61018b600160a060020a036004351660243561043b565b604051901515815260200160405180910390f35b34156101aa57600080fd5b6101b261046b565b60405190815260200160405180910390f35b34156101cf57600080fd5b61018b600160a060020a0360043581169060243516604435610471565b34156101f757600080fd5b6101ff6104e8565b60405160ff909116815260200160405180910390f35b341561022057600080fd5b61018b6004356104f1565b341561023657600080fd5b6101b2600160a060020a036004351661057c565b341561025557600080fd5b61026c600160a060020a036004351660243561058e565b005b341561027957600080fd5b61018b600160a060020a0360043516602435610654565b341561029b57600080fd5b6102a3610730565b604051600160a060020a03909116815260200160405180910390f35b34156102ca57600080fd5b6100f261073f565b34156102dd57600080fd5b61026c600160a060020a03600435166024356107aa565b34156102ff57600080fd5b61018b60048035600160a060020a03169060248035919060649060443590810190830135806020601f820181900481020160405190810160405281815292919060208401838380828437509496506107b995505050505050565b341561036457600080fd5b6101b2600160a060020a03600435811690602435166108e7565b341561038957600080fd5b61026c600160a060020a0360043516610904565b60018054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156104335780601f1061040857610100808354040283529160200191610433565b820191906000526020600020905b81548152906001019060200180831161041657829003601f168201915b505050505081565b600160a060020a033381166000908152600660209081526040808320938616835292905220819055600192915050565b60045481565b600160a060020a038084166000908152600660209081526040808320339094168352929052908120548211156104a657600080fd5b600160a060020a03808516600090815260066020908152604080832033909416835292905220805483900390556104de84848461094e565b5060019392505050565b60035460ff1681565b600160a060020a0333166000908152600560205260408120548290101561051757600080fd5b600160a060020a03331660008181526005602052604090819020805485900390556004805485900390557fcc16f5dbb4873280815c1ee09dbd06736cffcc184412cf7a71a0fdb75d397ca59084905190815260200160405180910390a2506001919050565b60056020526000908152604090205481565b60005433600160a060020a039081169116146105a957600080fd5b600160a060020a03808316600090815260056020526040808220805485019055600480548501905530909216917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9084905190815260200160405180910390a381600160a060020a031630600160a060020a03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8360405190815260200160405180910390a35050565b600160a060020a0382166000908152600560205260408120548290101561067a57600080fd5b600160a060020a03808416600090815260066020908152604080832033909416835292905220548211156106ad57600080fd5b600160a060020a038084166000818152600560209081526040808320805488900390556006825280832033909516835293905282902080548590039055600480548590039055907fcc16f5dbb4873280815c1ee09dbd06736cffcc184412cf7a71a0fdb75d397ca59084905190815260200160405180910390a250600192915050565b600054600160a060020a031681565b60028054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156104335780601f1061040857610100808354040283529160200191610433565b6107b533838361094e565b5050565b6000836107c6818561043b565b156108df5780600160a060020a0316638f4ffcb1338630876040518563ffffffff167c01000000000000000000000000000000000000000000000000000000000281526004018085600160a060020a0316600160a060020a0316815260200184815260200183600160a060020a0316600160a060020a0316815260200180602001828103825283818151815260200191508051906020019080838360005b8381101561087c578082015183820152602001610864565b50505050905090810190601f1680156108a95780820380516001836020036101000a031916815260200191505b5095505050505050600060405180830381600087803b15156108ca57600080fd5b5af115156108d757600080fd5b505050600191505b509392505050565b600660209081526000928352604080842090915290825290205481565b60005433600160a060020a0390811691161461091f57600080fd5b6000805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0392909216919091179055565b6000600160a060020a038316151561096557600080fd5b600160a060020a0384166000908152600560205260409020548290101561098b57600080fd5b600160a060020a038316600090815260056020526040902054828101116109b157600080fd5b50600160a060020a0380831660008181526005602052604080822080549488168084528284208054888103909155938590528154870190915591909301927fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9085905190815260200160405180910390a3600160a060020a03808416600090815260056020526040808220549287168252902054018114610a4e57fe5b505050505600a165627a7a72305820b9499601ecebea0e18fd633ac89894bb85eb8a9e3730335be46384e0e72d6c010029',
					id: 5100 } ]
				*/
				var accountsCodes = [];
				async.eachOfSeries(requests, function (value, key, requestsEachCallback) {
					var tmpAccountCode = {};
					tmpAccountCode.account = value.params[0];
					tmpAccountCode.code = codes[key].result;
					tmpAccountCode.balance = accountBalances[value.params[0]];
					accountsCodes.push(tmpAccountCode);
					requestsEachCallback();
				}, function (err) {
					if (err) {
						console.log("[ERROR] batchResults: ", err);
					}
					callback(null, accountsCodes);
				});
			},
			function (accountsCodes, callback) {
				async.eachSeries(accountsCodes, function (accountCode, eachCallback) {
					//console.log("[Top100]", accountCode.account, accountCode.code.substr(0, 10), accountCode.balance);
					data = accountCode.account;
					if (accountCode.code !== "0x" && !tokenExporter[accountCode.account]) {
						var tokenExporterService = require('../services/tokenExporter.js');
						tokenExporter[accountCode.account] = new tokenExporterService(config.providerIpc, configERC20.erc20ABI, accountCode.account, 1, 10);
						req.app.set('tokenExporter', tokenExporter);
					}

					if (accountCode.code !== "0x" && tokenExporter[accountCode.account]) {
						var allEvents = tokenExporter[accountCode.account].contract.allEvents({
							fromBlock: 0,
							toBlock: "latest"
						});
						if (allEvents) {
							allEvents.get(function (err, events) {
								if (err) {
									console.log("Error receiving historical events:", err);
									eachCallback(err);
								} else {
									client.hset('esn_contracts:eventslength', accountCode.account, events.length);
									var transfercount = 0;
									async.eachSeries(events, function (event, contracteachCallback) {
										if (event.blockNumber && (event.event === "Transfer" || event.event === "Approval")) {
											transfercount++;
										}
										client.hset('esn_contracts:transfercount', accountCode.account, transfercount);
										contracteachCallback();
									}, function (err) {
										eachCallback();
									});
								}
							});
						} else {
							eachCallback();
						}
					} else {
						var numBalance = new BigNumber(accountCode.balance);
						numBalance = numBalance.dividedBy(Ether);
						nowcnt++;
						if (numBalance >= 0.00000001) {
							cnt++;
							client.zadd('esn_top100', numBalance.toString(), accountCode.account);
						} else {
							client.zrem('esn_top100', accountCode.account);
						}
						eachCallback();
					}
				}, function (err) {
					callback(err, "완료 시간: " + printDateTime(), data, cnt, allcnt, nowcnt);
				});
			}
		], function (err, printdatetime, resaccount, rescount, resallcount, nowcount) {
			if (err) {
				console.log("Error " + err);
				return next(err);
			}

			client.hset('esn_top100:createtime', 'datetime', printDateTime());
			if (resallcount < nowcount) {
				client.hset('esn_top100:lastaccount', 'count', nowcount);
			}
			client.hset('esn_top100:lastaccount', 'nowcount', nowcount);
			if (resaccount != "") {
				client.hset('esn_top100:lastaccount', 'address', resaccount);
			}


			var max = 0,
				min = -1;
			var redis_args = ['esn_top100', max, min, 'WITHSCORES'];

			async.waterfall([
					function (apicallback) {
						client.hget('esn_top100:lastaccount', 'count', function (err, result) {
							return apicallback(err, result);
						});
					},
					function (allcnt, apicallback) {
						client.zrevrange(redis_args, function (err, result) {
							return apicallback(err, allcnt, result);
						});
					},
					function (allcnt, accounts, apicallback) {
						let totalAccounts = new BigNumber(0);
						let totalSupply = new BigNumber(0);
						var isAccount = true;

						async.eachSeries(accounts, function (account, apieachCallback) {
							async.setImmediate(function () {
								if (isAccount) {
									totalAccounts = totalAccounts.plus(1);
									isAccount = false;
								} else {
									let ret = new BigNumber(account);
									totalSupply = totalSupply.plus(ret);
									isAccount = true;
								}
								apieachCallback();
							});
						}, function (err) {
							apicallback(err, allcnt, totalAccounts.toNumber(), totalSupply.toNumber());
						});
					}
				],
				function (err, totalAccounts, activeAccounts, totalSupply) {
					if (err) {
						res.json(resultToJson(err, null));
					} else {
						var supplyinfo = {};
						client.hset('esn_top100:apisupport', 'totalAccounts', totalAccounts);
						client.hset('esn_top100:apisupport', 'activeAccounts', activeAccounts);
						client.hset('esn_top100:apisupport', 'totalSupply', totalSupply);
					}
				});

			var jsonResult = {};
			jsonResult.printdatetime = printdatetime;
			jsonResult.resaccount = resaccount;
			jsonResult.rescount = rescount;
			jsonResult.resallcount = resallcount;

			res.json(resultToJson(null, printdatetime));
			/*res.render("top100_settingup", {
				"printdatetime": printdatetime,
				"lastaccount": resaccount,
				"addcount": rescount,
				"allcount": resallcount
			});*/
			console.log("--------- Top100 Settingup End: ", printDateTime(), "--------- ");
		});
	}
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
