var express = require('express');
var router = express.Router();

var async = require('async');
var Web3 = require('web3');
const redis = require("redis");
const client = redis.createClient();
const pre_fix = 'explorerPeers:';

router.get('/:offset?', function (req, res, next) {
	var config = req.app.get('config');
	var web3 = new Web3();
	web3.setProvider(config.provider);
	var data = {};
	data.peers = [];

	client.on("error", function (err) {
		console.log("Error " + err);
	});

	async.waterfall([
		function (callback) {
			web3.parity.netPeers(function (err, result) {
				//console.log("result.connected: " + result.connected);
				callback(err, result.peers);
			});
		},
		function (peers, callback) {
			if (!peers) {
				return callback({
					name: "netPeers Error",
					message: "No Return."
				});
			}
			async.eachSeries(peers, function (peer, eachCallback) {
				const scan_time = printDateTime() + " (GMT+9)";
				var tmp_data = {};
				//id, name, remoteAddress
				//console.log("peer: " + peer.id, peer.name, peer.remoteAddress, peer.scantime);
				tmp_data.id = peer.id;
				tmp_data.name = peer.name; //Gesn/v0.3.2-unstable-8f84614d/linux-amd64/go1.9.4 //exe, ver, os, gover
				if (!peer.name || peer.name.length < 1) {
					eachCallback();
				} else if (!peer.protocols.eth || !peer.protocols.eth.head || peer.protocols.eth.head.length < 1 ){
					eachCallback();
				} else {
					if (peer.name.length > 2) {
						var sres = peer.name.split("/");
						if (sres.length > 4)
							sres.splice(1, 1);
						tmp_data.exe = sres[0];
						if (sres.length > 1) {
							var sres_ver = sres[1].split("-");
							if (sres_ver.length > 1)
								tmp_data.ver = sres_ver[0] + "-" + sres_ver[1];
							else
								tmp_data.ver = sres_ver[0];
						}
						if (sres.length > 2)
							tmp_data.os = sres[2];
						if (sres.length > 3)
							tmp_data.gover = sres[3];
					}
					tmp_data.remoteAddress = peer.network.remoteAddress;
					if (peer.network.remoteAddress.length > 2) {
						var rres = peer.network.remoteAddress.split(":");
						tmp_data.ip = rres[0];
						if (rres.length > 1)
							tmp_data.port = rres[1];
					}
					tmp_data.scantime = scan_time;

					if (tmp_data.ip && tmp_data.ip.split(".").length > 2 && tmp_data.id && tmp_data.id.length > 10) {
						var s = tmp_data.id;
						var h = 0,
							l = s.length,
							i = 0;
						if (l > 0)
							while (i < l)
								h = (h << 5) - h + s.charCodeAt(i++) | 0;
						var rds_key = pre_fix.concat(h);
						var rds_value = {
							id: tmp_data.id,
							exe: tmp_data.exe,
							ver: tmp_data.ver,
							os: tmp_data.os,
							gover: tmp_data.gover,
							ip: tmp_data.ip,
							port: tmp_data.port,
							scantime: tmp_data.scantime
						};
						client.hmset(rds_key, rds_value);
						var rds_key2 = pre_fix.concat("list");
						client.hset(rds_key2, h, tmp_data.id);
					}
					eachCallback();
				}
			}, function (err) {
				callback(err);
			});
		},
		function (callback) {
			var rds_key = pre_fix.concat("list");
			client.hgetall(rds_key, function (err, replies) {
				var pre_fields = [];
				for (var hkey in replies) {
					pre_fields.push(hkey);
				}
				callback(err, pre_fields);
			});
		},
		function (pre_fields, callback) {
			async.eachSeries(pre_fields, function (field, eachCallback) {
				client.hgetall(pre_fix.concat(field), function (err, peer_info) {
					if (err) {
						return eachCallback(err);
					}
					var sIP = peer_info.ip.split(".");
					sIP[1] = "***";
					peer_info.ip = sIP.join(".");
					data.peers.push(peer_info);
					eachCallback();
				});
			}, function (err) {
				callback(err);
			});
		}

	], function (err) {
		if (err) {
			console.log("Error " + err);
			return next(err);
		}

		var arrExe = [];
		var arrVer = [];
		var arrOs = [];
		var arrGover = [];
		for (var h in data.peers) {
			arrExe.push(data.peers[h].exe);
			arrVer.push(data.peers[h].ver);
			arrOs.push(data.peers[h].os);
			arrGover.push(data.peers[h].gover);
		}

		data.commands = arrExe.reduce(function (acc, curr) {
			if (typeof acc[curr] == 'undefined') {
				acc[curr] = 1;
			} else {
				acc[curr] += 1;
			}
			return acc;
		}, {});

		data.versions = arrVer.reduce(function (acc, curr) {
			if (typeof acc[curr] == 'undefined') {
				acc[curr] = 1;
			} else {
				acc[curr] += 1;
			}
			return acc;
		}, {});

		data.oss = arrOs.reduce(function (acc, curr) {
			if (typeof acc[curr] == 'undefined') {
				acc[curr] = 1;
			} else {
				acc[curr] += 1;
			}
			return acc;
		}, {});

		data.goversions = arrGover.reduce(function (acc, curr) {
			if (typeof acc[curr] == 'undefined') {
				acc[curr] = 1;
			} else {
				acc[curr] += 1;
			}
			return acc;
		}, {});

		console.dir(data.commands);
		res.render('peers', {
			peers: data.peers, commands: data.commands, versions: data.versions, oss: data.oss, goversions: data.goversions
		});
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
	var calendar = currentDate.getFullYear() + "-" + addZeros((currentDate.getMonth() + 1).toString(), 2) + "-" + addZeros(currentDate.getDate().toString(), 2);
	var currentHours = addZeros(currentDate.getHours(), 2);
	var currentMinute = addZeros(currentDate.getMinutes(), 2);
	var currentSeconds = addZeros(currentDate.getSeconds(), 2);
	return calendar + " " + currentHours + ":" + currentMinute + ":" + currentSeconds;
}