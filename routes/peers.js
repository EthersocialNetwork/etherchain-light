const express = require('express');
const router = express.Router();

const async = require('async');
const Web3 = require('web3');
const redis = require("redis");
const client = redis.createClient();
const geoip = require('geoip-lite');
const iso = require('iso-3166-1');

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
			var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
			//console.log("\nclient ip: "+ip+"\n");
			if (ip == "115.68.0.74") {
				web3.parity.netPeers(function (err, result) {
					//console.log("result.connected: " + result.connected);
					return callback(err, result.peers);
				});
			} else {
				return callback(null, null);
			}
		},
		function (peers, callback) {
			if (!peers) {
				return callback(null);
			} else {
				var multi = client.multi();
				async.eachSeries(peers, function (peer, eachCallback) {
					const time_now = new Date();
					const scan_time = printDateTime(time_now);
					const scan_msTime = time_now.getTime();
					var tmp_data = {};
					//id, name, remoteAddress
					//console.log("peer: " + peer.id, peer.name, peer.remoteAddress, peer.scantime);
					tmp_data.id = peer.id;
					tmp_data.name = peer.name; //Gesn/v0.3.2-unstable-8f84614d/linux-amd64/go1.9.4 //exe, ver, os, gover
					if (!peer.name || peer.name.length < 1) {
						return eachCallback();
					} else if (!peer.protocols.eth || !peer.protocols.eth.head || peer.protocols.eth.head.length < 1) {
						return eachCallback();
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

						if (tmp_data.ip && tmp_data.ip.split(".").length > 2 && tmp_data.id && tmp_data.id.length > 10) {
							var s = tmp_data.id;
							var h = 0,
								l = s.length,
								i = 0;
							if (l > 0)
								while (i < l)
									h = (h << 5) - h + s.charCodeAt(i++) | 0;
							var enode = "enode://";
							enode = enode.concat(tmp_data.id, "@", tmp_data.ip, ":", tmp_data.port);

							var geo = geoip.lookup(tmp_data.ip); //node ./node_modules/geoip-lite/scripts/updatedb.js
							if (!geo.city || geo.city.length < 2) {
								geo.city = "unknown";
							}
							var txt_geo = String(geo.city).concat(", ", geo.country);
							var rds_value = {
								id: tmp_data.id,
								exe: tmp_data.exe,
								ver: tmp_data.ver,
								os: tmp_data.os,
								gover: tmp_data.gover,
								ip: tmp_data.ip,
								port: tmp_data.port,
								scantime: scan_time,
								enode: enode,
								name: tmp_data.name,
								scanmstime: scan_msTime,
								geo: txt_geo
							};

							var rds_key = pre_fix.concat(h);
							multi.hmset(rds_key, rds_value);
							var rds_key2 = pre_fix.concat("list");
							multi.hset(rds_key2, h, tmp_data.id);
						}
						return eachCallback();
					}
				}, function (err) {
					multi.exec(function (errors, results) {
						if (errors) {
							console.log(errors);
						}
					});
					multi = null;
					return callback(err);
				});
			}
		},
		function (callback) {
			var rds_key = pre_fix.concat("list");
			client.hgetall(rds_key, function (err, replies) {
				var pre_fields = [];
				for (var hkey in replies) {
					pre_fields.push(hkey);
				}
				return callback(err, pre_fields);
			});
		},
		function (pre_fields, callback) {
			async.eachSeries(pre_fields, function (field, eachCallback) {
				client.hgetall(pre_fix.concat(field), function (err, peer_info) {
					if (err) {
						return eachCallback(err);
					}
					if (!peer_info) {
						console.log("no peer_info: " + pre_fix.concat(field));
					} else if (peer_info.scanmstime > (new Date()).getTime() - 60 * 60 * 24 * 2 * 1000) {
						var sIP = peer_info.ip.split(".");
						sIP[1] = "***";
						peer_info.ip = sIP.join(".");
						data.peers.push(peer_info);
					}
					return eachCallback();
				});
			}, function (err) {
				return callback(err);
			});
		}

	], function (err) {
		if (err) {
			console.log("Error " + err);
		}
		data.peers = data.peers.sort((a, b) => {
			if (!b.scanmstime) {
				return -1;
			}
			if (!a.scanmstime) {
				return 1;
			}
			if (a.scanmstime < b.scanmstime) {
				return 1;
			}
			if (a.scanmstime > b.scanmstime) {
				return -1;
			}
			return 0;
		});
		var arrExe = [];
		var arrVer = [];
		var arrOs = [];
		var arrGover = [];
		var arrGeo = [];
		for (var h in data.peers) {
			if (typeof data.peers[h].exe === 'undefined' || typeof data.peers[h].ver === 'undefined' || typeof data.peers[h].os === 'undefined' || typeof data.peers[h].gover === 'undefined' || typeof data.peers[h].geo === 'undefined') {
				continue;
			}
			arrExe.push(data.peers[h].exe);
			arrVer.push(data.peers[h].ver);
			arrOs.push(data.peers[h].os);
			arrGover.push(data.peers[h].gover);
			arrGeo.push(data.peers[h].geo);
		}

		data.commands = makeReturnSeries(arrExe);
		data.versions = makeReturnSeries(arrVer);
		data.oss = makeReturnSeries(arrOs);
		data.goversions = makeReturnSeries(arrGover);
		data.geo = makeReturnSeries(arrGeo);
		data.geoCategories = makeGeoCategories(arrGeo);
		res.render('peers', {
			peers: data.peers,
			commands: data.commands,
			versions: data.versions,
			oss: data.oss,
			goversions: data.goversions,
			geo: data.geo,
			geoCategories: data.geoCategories
		});
		data = null;
		web3 = null;
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

function printDateTime(currentDate) {
	var calendar = currentDate.getFullYear() + "-" + addZeros((currentDate.getMonth() + 1).toString(), 2) + "-" + addZeros(currentDate.getDate().toString(), 2);
	var currentHours = addZeros(currentDate.getHours(), 2);
	var currentMinute = addZeros(currentDate.getMinutes(), 2);
	var currentSeconds = addZeros(currentDate.getSeconds(), 2);
	return calendar + " " + currentHours + ":" + currentMinute + ":" + currentSeconds;
}

function makeReturnSeries(arr) {
	prcArray = [];
	prcArray = arr.reduce(function (acc, curr) {
		if (acc[curr]) {
			acc[curr] += 1;
		} else {
			acc[curr] = 1;
		}
		return acc;
	}, {});
	resArray = [];
	for (var kcmd in prcArray) {
		resArray.push({
			name: kcmd,
			y: prcArray[kcmd]
		});
	}
	return JSON.stringify(resArray);
}

function makeGeoCategories(arr) {
	var prcArray = [];
	prcArray = arr.reduce(function (acc, curr) {
		if (acc[curr]) {
			acc[curr] += 1;
		} else {
			acc[curr] = 1;
		}
		return acc;
	}, {});

	var colors = ['#f28f43', '#0d233a', '#8bbc21', '#910000', '#1aadce',
		'#492970', '#2f7ed8', '#77a1e5', '#c42525', '#a6c96a'
	];
	var result = {};
	result.categories = [];
	result.data = [];

	var idx = 0;
	for (var kcmd in prcArray) {
		if (idx > (colors.length - 1)) {
			return JSON.stringify(result);
		}

		var spArray = kcmd.split(", ");
		var country = iso.whereAlpha2(spArray[1]).country;
		if (!country) {
			country = spArray[1];
		}

		var subCategories = {};
		if (!(result.categories.includes(country))) {
			result.categories.push(country);
			subCategories.y = prcArray[kcmd];
			subCategories.color = colors[idx];
			subCategories.drilldown = {};
			subCategories.drilldown.name = country;
			subCategories.drilldown.categories = [];
			subCategories.drilldown.categories.push(spArray[0] + ", " + country);
			subCategories.drilldown.data = [];
			subCategories.drilldown.data.push(prcArray[kcmd]);
			result.data.push(subCategories);
			idx++;
		} else {
			for (var rLeni = 0; rLeni < result.data.length; rLeni++) {
				if (result.data[rLeni].drilldown.name == country) {
					result.data[rLeni].y += prcArray[kcmd];
					result.data[rLeni].drilldown.categories.push(spArray[0] + ", " + country);
					result.data[rLeni].drilldown.data.push(prcArray[kcmd]);
				}
			}
		}
	}
	return JSON.stringify(result);
}