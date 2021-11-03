/*
 * Decoder for Adeunis field test device ARF8112AA
 * 
 * Jonas Schwartze - j.schwartze@nibelungen-wohnbau.de
 *
 * This file can be used under any terms and conditions of the MIT Licence.
 * See LICENCE file for details. 
 */

function Decoder(b, fport) {
	var decoded = {};
	var bytes = [];
	var current_bit = 0;
	for (var i in b) {
		bytes.push(b[i]);
	}
	decoded = merge(decoded, decode_status(b[ current_bit ]));
	current_bit++;

	if ( decoded.temperature_reported ) {
		decoded = merge( decoded, decode_temperature( b[ current_bit ] ) );
		current_bit++;
	}
	if ( decoded.gps_reported ) {
		merge( decoded, decode_gps( b.slice( current_bit , current_bit + 9) ) );
		current_bit+=9;
	}
	if ( decoded.uplink_counter_reported ) {
		decoded.uplink_frame_count = b[ current_bit ];
		current_bit++;
	}
	if ( decoded.downlink_counter_reported ) {
		decoded.downlink_frame_count = b[ current_bit ];
		current_bit++;
	}
	if ( decoded.battery_level_reported ) {
		decoded.battery_level = ( b[ current_bit ]  << 8  ) + b[ current_bit + 1 ];
		current_bit +=2;
	}
	if ( decoded.rssi_snr_reported ) {
		decoded.rssi = b[ current_bit ] * -1;
		current_bit++;
		decoded.snr = b[ current_bit ];
		current_bit++;
	}
	decoded.bytes = "0x"+ bufferToHex(b);
	decoded.size = b.length;
	decoded.fport = fport;
	return decoded;
}

function decode_status(byte) {
	var decoded = {};
	var codes = [
		"rssi_snr_reported",
		"battery_level_reported",
		"downlink_counter_reported",
		"uplink_counter_reported",
		"gps_reported",
		"triggered_by_pushbutton",
		"triggered_by_accelerometer",
		"temperature_reported"
	];
	for (var code in codes) {
		decoded[codes[code]] = byte >> code & 1;
	}
	return decoded; 
}

function decode_temperature(byte) {
	var decoded = {};
	var negative = byte >> 7 & 1;
	decoded.temperature = negative ? ( (byte & 127) - 128) : (byte);
	return decoded; 
}

function decode_gps(bytes) {
	
	var decoded = {};
	decoded = merge (decoded, decode_coordinate( bytes.slice(0,4), "latitude" ) );
	decoded = merge (decoded, decode_coordinate( bytes.slice(4,8), "longitude" ) );
	decoded.gps = decoded.gps_longitude + "," + decoded.gps_latitude;
	decoded = merge( decoded, decode_gps_quality( bytes[8] ) );
	return decoded; 
}

function decode_coordinate (bytes, type) {
	var decoded = {};
	var coordinate = "";
	for (var digit = 0; digit < 7; digit++ ) {
		var byte = Math.floor( digit / 2 );
		var bit = 4 - ( digit % 2 ) * 4;
		var dig = bytes[byte] >> bit & 15;
		//console.log(bytes[byte] + "(" + byte + ":" + bit + ") = " + dig);
		coordinate += dig;
	}
	coordinate += "0";
	var hemisphere = "";
	var multiplier = bytes[3] & 1 ? -1 : 1;
	if ( type == "latitude" ) {
		hemisphere = bytes[3] & 1 ? "South" : "North";
		coordinate = coordinate.slice(0,2) + "°" + coordinate.slice(2,4) + "," + coordinate.slice(4);

	}
	if ( type == "longitude" ) {
		hemisphere = bytes[3] & 1 ? "West" : "East";
		coordinate = coordinate.slice(0,3) + "°" + coordinate.slice(3,5) + "," + coordinate.slice(5);
	}
	decoded["gps_" + type] = Number( coordinate.split("°")[0] ) + Number( coordinate.split("°")[1].replace(",",".") / 60 );
	decoded["gps_" + type] *= multiplier;
	decoded["gps_" + type + "_ddm"] = coordinate + hemisphere[0];
	decoded["gps_" + type + "_hemisphere"] = hemisphere;
	return decoded;
}

function decode_gps_quality (byte) {
	var quality = {};
	var reception_verbs = [ "Good", "Average", "Poor"];
	quality.gps_reception = byte >> 4;
	var rcpt = quality.gps_reception > 3 ? 2 : quality.gps_reception - 1;
	quality.gps_reception_text = reception_verbs[ rcpt ];
	quality.gps_satellites = byte & 15;
	
	return quality;
}

function merge(obj1, obj2) {
	for (var attrname in obj2) { obj1[attrname] = obj2[attrname]; }
	return obj1;
}

function bcdtonumber(bytes) {
	var num = 0;
	var m = 1;
	var i;
	for (i = 0; i < bytes.length; i++) {
		num += (bytes[bytes.length - 1 - i] & 0x0F) * m;
		num += ((bytes[bytes.length - 1 - i] >> 4) & 0x0F) * m * 10;
		m *= 100;
	}
	return num;
}

function bufferToHex(buffer) {
    var s = '', h = '0123456789ABCDEF';
    for (var byte = 0; byte < buffer.length; byte++) {
		s += h[buffer[byte] >> 4] + h[buffer[byte] & 15]; 
	};
    return s;
}

function bytestofloat16(bytes) {
    var sign = (bytes & 0x8000) ? -1 : 1;
    var exponent = ((bytes >> 7) & 0xFF) - 127;
    var significand = (bytes & ~(-1 << 7));

    if (exponent == 128) 
        return 0.0;

    if (exponent == -127) {
        if (significand == 0) return sign * 0.0;
        exponent = -126;
        significand /= (1 << 6);
    } else significand = (significand | (1 << 7)) / (1 << 7);

    return sign * significand * Math.pow(2, exponent);
}

// Chirpstack decoder wrapper
function Decode(fPort, bytes, variables) {
	var decoded = Decoder(bytes, fPort, variables);
	return merge(decoded, variables);
}

// Direct node.js CLU wrapper (payload bytestring as argument)
try {
    console.log(Decoder(Buffer.from(process.argv[2], 'hex'), Number(process.argv[3])) );
} catch(err) {}