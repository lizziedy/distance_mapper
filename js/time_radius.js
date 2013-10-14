/**
 * copyright (c) 2013, by Lizzie DeYoung. All rights reserved.
 * Text, graphics, and HTML code are protected by US and International
 * Copyright Laws, and may not be copied, reprinted, published,
 * translated, hosted, or otherwise distributed by any means without
 * explicit permission.
*/

var Helpers = {
    distance_estimate:function(point1, point2) {
	var lat_dist = point1.lat() - point2.lat();
	var lon_dist = point1.lng() - point2.lng();
	var sqr_dist = lat_dist * lat_dist + lon_dist * lon_dist;
	var dist = Math.sqrt(sqr_dist);

	return dist;
    },

    get_avg_point:function(point1, point2) {
	var avg_lat =
	    (point1.lat() + point2.lat()) / 2;
	var avg_lon = 
	    (point1.lng() + point2.lng()) / 2;
	return new google.maps.LatLng(avg_lat, avg_lon);
    }
}

function RadialPoint() {
    this.current = null;
    this.last_point = null;
    this.upper_bound = null;
    this.lower_bound = null;
    this.time = -1;
    this.upper_time = -1;
    this.lower_time = -1;
    this.upper_nether_region = null;
    this.should_refine_later = false;
    this.is_estimate = true;

    this.update_bounds = function(goal_time, hub) {
	this.last_point = this.current;
	// update lower and upper bounds
	if(time_radius.num_iterations == 0) return;
	if(this.time >= 0) {
	    if(this.time <= goal_time &&
	       (this.lower_time < 0 || this.lower_time < this.time)) {
		this.lower_bound = this.current;
		this.lower_time = this.time;
	    } else if (this.time > goal_time &&
		       (this.upper_time < 0 || this.upper_time > this.time)) {
		this.upper_bound = this.current;
		this.upper_time = this.time;
	    }
	} else {
	    if(this.lower_bound != null && this.upper_bound == null) {
		if(this.upper_nether_region == null || 
		   (Helpers.distance_estimate(this.current, hub) < 
		    Helpers.distance_estimate(this.upper_nether_region, hub))) {
		    this.upper_nether_region = this.current;
		}
	    }
	}
    };

    this.refine_with_upper_lower = function(goal_time, hub) {
	var diff_lat = this.upper_bound.lat() - this.lower_bound.lat();
	var diff_lon = this.upper_bound.lng() - this.lower_bound.lng();
        var half_lat = diff_lat / 2;
        var half_lon = diff_lon / 2;
	var move_ratio = (goal_time - this.lower_time)/(this.upper_time - this.lower_time);
	var ratio_lat = diff_lat * move_ratio;
	var ratio_lon = diff_lon * move_ratio;
	var diff_ratio_lat = (half_lat - ratio_lat)/2;
	var diff_ratio_lon = (half_lon - ratio_lon)/2;
	var lat = half_lat - diff_ratio_lat;
	var lon = half_lon - diff_ratio_lon;
	
        this.current = new google.maps.LatLng(
	    this.lower_bound.lat() + lat, this.lower_bound.lng() + lon);
	var ratio = (lat/hub.lat() + lon/hub.lng())/2
	return ratio;
    };

    this.refine_with_time = function(goal_time, hub) {
	var ratio = goal_time / this.time;
	if(time_radius.num_iterations == 0) {
	    if(goal_time < this.time) ratio /= 2;
	    if(goal_time > this.time) ratio *= 2;
	}
	if(this.upper_nether_region != null) {
	    this.current = Helpers.get_avg_point(this.lower_bound, this.upper_nether_region);
	} else {
            var lat = (this.current.lat() - hub.lat()) * ratio;
            var lon = (this.current.lng() - hub.lng()) * ratio;
            this.current = new google.maps.LatLng(hub.lat() + lat, hub.lng() + lon);
	}

	return ratio;
    };

    this.find_near_nowhere = function(hub) {
	if(this.lower_bound == null) {
	    this.shrink_until_find(hub);
	} else {
	    this.current = 
		Helpers.get_avg_point(this.lower_bound, this.upper_nether_region);
	}
    }

    this.shrink_until_find = function(hub) {
	var lat = (this.current.lat() - hub.lat()) * .5;
	var lon = (this.current.lng() - hub.lng()) * .5;
        this.current = new google.maps.LatLng(hub.lat() + lat, hub.lng() + lon);
    }

    this.refine = function (goal_time, hub) {
	var prev_time = this.time;
	this.should_refine_later = false;
	this.update_bounds(goal_time, hub);

	if(this.upper_bound != null && this.lower_bound != null) {
	    this.is_estimate = false;
	    return this.refine_with_upper_lower(goal_time, hub);
	} else if (this.time >= 0) {
	    this.is_estimate = false;
	    return this.refine_with_time(goal_time, hub);
	} else {
	    this.find_near_nowhere(hub);
	    //this.shrink_until_find(hub);
	    return 1;
	}
    };
}

function TimeRadius(args) {
    this.map = null;
    this.points = new Array();
    this.time = 20; // minutes
    this.error = 1;
    this.num_points = 20;
    this.max_iterations = 10;
    this.num_iterations = 0;

    if(args['center']) {
	this.center = args['center'];
    } else {
	alert("center is a required argument");
    }

    if(args['time']) {
	this.time = args['time'];
    }
    if(args['num_points']) {
	this.num_points = args['num_points'];
    }
    if(args['num_iterations']) {
	this.num_iterations = args['num_iterations'];
    }

    for(var i = 0; i < this.num_points; i++) {
	var lat = this.center.lat() + Math.sin((2*Math.PI*i)/this.num_points);
	var lon = this.center.lng() + Math.cos((2*Math.PI*i)/this.num_points);
	var point = new RadialPoint();
	point.current = new google.maps.LatLng(lat, lon);
	this.points[i] = point;
    }

    this.refine_points = function() {
	var total = 0;
	var count = 0;
	for(var i in this.points) {
	    var point = this.points[i];
	    var refine_ratio = point.refine(this.time, this.center);
	    if(!point.should_refine_later) {
		total += refine_ratio;
		count++;
	    }
	}

	total /= count;

	for(var i in this.points) {
	    var point = this.points[i];
	    if(point.should_refine_later) {
		var first = this.num_iterations == 0;
		point.refine_later(total, this.center, first);
	    }
	}
	
	var points_ok = this.check_points();
	this.num_iterations += 1;
	if(points_ok || this.num_iterations == this.max_iterations) {
	    for(var i in this.points) {
		var point = this.points[i];
		if(point.upper_bound != null && 
		   point.upper_time - this.time < this.error &&
		   (point.lower_time != null && 
		    point.upper_time - this.time < this.time - point.lower_time)) {
		    point.current = point.upper_bound;
		    point.time = point.upper_time;
		}
		else if(point.lower_bound != null) {
		    if(this.time - point.lower_time < this.error) {
			point.current = point.lower_bound;
			point.time = point.lower_time;
		    } else if (point.upper_bound != null) {
			point.current = Helpers.get_avg_point(
			    point.lower_bound, point.upper_bound);
			point.time = (point.lower_time + point.upper_time) / 2;
		    } else if (point.upper_nether_region != null) {
			point.current = point.upper_nether_region;
		    } else {
			point.current = point.lower_bound;
			point.time = point.lower_time;
		    }
		} else {
		    point.current = null;
		}
	    }
	}

	if(!points_ok && this.num_iterations < this.max_iterations) {
	    return true;
	} else {
	    return false;
	}
    };

    this.check_points = function() {
	for(i in this.points) {
	    var point = this.points[i];
/*
	    if(point.lower_bound == null) {
		return false;
	    }
	    if(point.upper_bound == null && point.upper_nether_region == null) {
		return false;
	    }
	    if(this.time - point.lower_time > this.error
	       &&
	       (point.upper_bound != null 
		&& point.upper_time - this.time > this.error)) {
		return false;
	    }
	    if(point.upper_bound == null && point.upper_nether_region != null) {
		if(Helpers.distance_estimate(
		    point.upper_nether_region, point.lower_bound) > .01) {
		    return false;
		}
	    }
*/
	    if(Helpers.distance_estimate(point.last_point,point.current) > .03) {
		return false;
	    }
	}
	return true;
    }

    this.process_times = function(response_elements) {
	for(var i = 0; i < response_elements.length; i++) {
	    var element = response_elements[i];
	    this.points[i].time = -1;
	    if(element.status == "OK") {
		this.points[i].time = element.duration.value/60;
	    }
	}
    };

    this.get_point_array = function() {
	var points = new Array();
	for(i in this.points) {
	    points[i] = this.points[i].current;
	}

	return points;
    };

    this.get_culled_point_array = function() {
	var points = new Array();
	var j = 0;
	for(i in this.points) {
	    if(this.points[i].current != null) {
		points[j] = this.points[i].current;
		j++;
	    }
	}

	return points;
    };

    this.get_bounds = function() {
	var north = null;
	var south = null;
	var west = null;
	var east = null;

	for(i in this.points) {
	    if(this.points[i].current != null) {
		var lat = this.points[i].current.lat();
		var lon = this.points[i].current.lng();
		if(north == null || north < lat) {
		    north = lat;
		}
		if(south == null || south > lat) {
		    south = lat;
		}
		if(east == null || east < lon) {
		    east = lon;
		}
		if(west == null || west > lon) {
		    west = lon;
		}
	    }
	}

	var northeast = new google.maps.LatLng(north, east);
	var southwest = new google.maps.LatLng(south, west);
	var bound = new google.maps.LatLngBounds(southwest, northeast);

	return bound;
    }
}

function MapContainer(args) {
    this.map = null;
    this.boundary = new Array();
    this.boundary_overlay = null;
    this.center = null;

    this.set_boundary = function(points, center) {
	if(this.map == null) {
	    alert("map can't be null");
	}
	
	if(this.center != null) {
	    this.center.setMap(null);
	}
	this.center = new google.maps.Marker({
	    position: center,
	    map: this.map
	});
	/*
	  for(var i in this.boundary) {
	  this.boundary[i].setMap(null);
	  }

	  for(var i in points) {
	  if(points[i].current != null) {
	  this.boundary[i] = new google.maps.Marker({
	  position: points[i].current,
	  map: this.map,
	  title: 
	  "point: " + i + "\n"
	  + "time: " + points[i].time + "\n"
	  + "lower_time: " + points[i].lower_time + "\n"
	  + "upper_time: " + points[i].upper_time + "\n"
	  });
	  }
	  }

	  this.boundary[points.length] = new google.maps.Marker({
	  position: center,
	  map: this.map
	  });
	*/
	if(this.boundary_overlay != null) {
	    this.boundary_overlay.setMap(null);
	}

	var paths =time_radius.get_culled_point_array(); 
	this.boundary_overlay = new google.maps.Polygon({
	    paths: paths,
	    strokeColor: "#0000FF",
	    strokeOpacity: 1,
	    strokeWeight: 2,
	    fillColor: "#0000FF",
	    fillWeight: .5
	});
	this.boundary_overlay.setMap(this.map);
    }
}

function FormContainer(args) {
    this.map = document.getElementById('map-container');
    this.address = document.getElementById('address');
    this.route_type = document.getElementById('route-type');

    this.get_address = function() {
	return this.address.value.toString();
    };
    this.get_time = function() {
	var minutes = document.getElementById('minutes').value;
	var hours = document.getElementById('hours').value;
	var time = 0;
	if (hours != null) {
	    hours = parseInt(hours);
	    if (hours >= 0) {
		time = hours * 60;
	    }
	}
	if (minutes != null) {
	    minutes = parseInt(minutes);
	    if (minutes >= 0) {
		time += minutes;
	    }
	}
	
	if (time > 0) {
	    return time;
	}

	alert("time inputs must be greater than 0");
    };
    this.get_route_type = function() {
	var route_type = this.route_type.value.toString();
	return google.maps.TravelMode[route_type]
    };
}

function Services(args) {
    this.distance_matrix = new google.maps.DistanceMatrixService();
    this.geocoder = new google.maps.Geocoder;
}

var form_container = null;
var time_radius = null;
var map_container = null;
var services = null;

function initialize() {
    form_container = new FormContainer(null);
    map_container = new MapContainer(null);
    services = new Services(null);
    var latLng = new google.maps.LatLng(39.8282, -98.5795);
    map_container.map = new google.maps.Map(form_container.map, {
	zoom: 4,
	center: latLng,
	mapTypeId: google.maps.MapTypeId.ROADMAP
    });
}

function run() {
    var address = form_container.get_address();
    services.geocoder.geocode({address: address}, find_time_radius);
}

//var first = true;
function find_time_radius(results, status) {
    if(status == "OK") {
//	if(first) {
	var center = results[0].geometry.location;
	var time = form_container.get_time();

	time_radius = new TimeRadius({center: center, time: time});
	map_container.map.setCenter(time_radius.center);

//	    first = false;
//	}
	get_time_bounds();
    };
}


var number = 0;
function get_time_bounds() {
    console.log("hit " + number + " times");
    number++;
    if(number > 100) {
	var breakhere = true;
    }
    services.distance_matrix.getDistanceMatrix(
	{
	    origins: [time_radius.center],
	    destinations: time_radius.get_point_array(),
	    travelMode: form_container.get_route_type(),
	    durationInTraffic: false, // only works for business license ($10,000)
	    avoidHighways: false,
	    avoidTolls: false
	}, calculate_time_bounds
    );
}

var timeout = 60;
function calculate_time_bounds(response, status) {
    if(status == "OK") {
	timeout = 60;
	time_radius.process_times(response.rows[0].elements);
	output_times(response);
	//	map_container.set_boundary(time_radius.points, time_radius.center);
	var cont = time_radius.refine_points();

	if(cont){
	    get_time_bounds();
	} else {
	    map_container.set_boundary(time_radius.points, time_radius.center);
	    map_container.map.fitBounds(time_radius.get_bounds());
	}
    } else {
	timeout *= 2;
	setTimeout(get_time_bounds, timeout);
    }
}

function output_times(response) {
    var theDiv = document.getElementById('dir-container');
    // assuming row length is 1
    for(var i = 0; i < response.rows.length; i++) {
	for(var j = 0; j < response.rows[i].elements.length; j++) {
            var element = response.rows[i].elements[j];
            var duration = "not found; ";
	    if(element.status == "OK") {
		var duration = element.duration.text + "; ";
	    } else {
		var duration = element.status;
	    }
	    var content = document.createTextNode(duration);
	    theDiv.appendChild(content);
	}
    }
}

function check_heights() {
    alert($('#map-holder').outerHeight());
}

function set_map_size() {
    var w = $('#map-holder').innerWidth();
    var width_buffer = 30;
    w = w - width_buffer;
    var h = w*.8
    var map = $('#map-container')
    map.css('height', h);
    map.css('width', w);
}

$(document).ready(function(){
    set_map_size();
});

$(window).resize(function(){
    set_map_size();
});
