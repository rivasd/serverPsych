/**
 * A little utility module meant to ease communication between a djPsych server and jsPsych.
 * 
 * @module Percept
 * @see {@link https://github.com/rivasd/djPsych}
 * @requires jQuery
 * @requires jQuery-UI
 * @requires jsPsych
 */
var Percept = (function djPsych($){
	var core ={};
	var expLabel = "";
	var staticUrl = "";
	var prefix = "";
	var version ="";
	var meta = "";
	var sandbox = false;
	
	var completion;
	
	/**@type Boolean */
	var initialized = false
	
	/**
	 * Maps trial-types to a function that should take a block from the server-returned timeline and output the same block but ready to be used
	 * as is inside a jsPsych timeline.
	 * @private
	 * 
	 */
	var adapters={};
	
	function get_browser_info(){
	    var ua=navigator.userAgent,tem,M=ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || []; 
	    if(/trident/i.test(M[1])){
	        tem=/\brv[ :]+(\d+)/g.exec(ua) || []; 
	        return {name:'IE',version:(tem[1]||'')};
	        }   
	    if(M[1]==='Chrome'){
	        tem=ua.match(/\bOPR\/(\d+)/)
	        if(tem!=null)   {return {name:'Opera', version:tem[1]};}
	        }   
	    M=M[2]? [M[1], M[2]]: [navigator.appName, navigator.appVersion, '-?'];
	    if((tem=ua.match(/version\/(\d+)/i))!=null) {M.splice(1,1,tem[1]);}
	    return {
	      name: M[0],
	      version: M[1]
	    };
	 }
	
	/**
	 * Initialize the serverPsych module by pointing it to the right URLs for communicating with the server
	 * 
	 * @param	{object}	opts
	 * @param {String} opts.name		When you created your Experiment object on djPsych, this is the label field. your experiment lives at this URL
	 * @param {String} opts.staticRoot	corresponds to the MEDIA_URL setting in the settings.py of the server. tells us where to fetch static content.
	 * @param {boolean} opts.sandboxval	Set to true if you wish to use djPsych with the sandbox page of the djPsych server. Wont actually send but display it locally
	 * @param {Object}	opts.completion	An object describing how many runs of each type of setting have been completed to date. If a configuration has no data generated for it yet, it does not appear in this object.
	 * 
	 * @memberof! Percept
	 * @function init
	 */
	core.init = function init(opts){
		
		if(initialized === true){
			throw "serverPsych is meant to be initialized only once";
		}
		
		if(typeof opts.sandboxval != 'undefined'){
			sandbox = opts.sandboxval;
		}
		
		expLabel = opts.name;
		staticUrl = opts.staticRoot;
		prefix = staticUrl+'/'+expLabel+'/';
		completion = opts.completion || {};
		initialized = true;
	}
	
	/**
	 * Return the url prefix of the the experiment, useful to dynamically build URLs to your stimuli if needed
	 * 
	 * @function getPrefix
	 * @memberof! Percept
	 * @returns {String}
	 */
	core.getPrefix = function(){
		return prefix;
	}
	
	core.prefix = function(path){
		return prefix+path;
	}
	
	/**
	 * Returns the experiment's label as set when you created the experiment
	 * @function getLabel
	 * @memberof Percept
	 * @returns {String}
	 */
	core.getLabel = function(){
		return expLabel;
	}
	
	core.chooseVersion= function(newversion){
		version = newversion;
	}
	
	core.getSandboxVal = function(){
		return sandbox;
	}
	
	/**
	 * Puts Percept in sandbox mode, meaning data will not be sent when calling .save()
	 * @function asSandbox
	 * @memberof Percept
	 * 
	 */
	core.asSandbox = function(){
		sandbox = true;
	}
	
	/**
	 * Get information about which configurations the participant has completed in the past for your experiment
	 * @function completion
	 * @memberof Percept
	 * @returns {object} An object of "config name": times completed, or undefined if not set by the server
	 */
	core.completion = function(){
		return completion;
	};
	
	/**
	 * Tells you how many times the participant has completed this experiment in the past
	 * @function count
	 * @memberof Percept
	 * @returns {Number}
	 */
	core.count = function(){
		var count = 0;
		for (var run in completion){
			if(completion.hasOwnProperty(run)){
				count += completion[run];
			}
		};
		return count;
	};
	
	function unpackInstructions(timeline){
		 var newTimeline = [];
		timeline.forEach(function(elt, i, array) {
			if(typeof elt.instructions != 'undefined'){
				// add the instructions that should go before
				if(typeof elt.instructions.before != 'undefined'){
					newTimeline.push(elt.instructions.before);
				}
				// add the actual trial
				newTimeline.push(elt);
				// add the instructions that should go after
				if(typeof elt.instructions.after != 'undefined'){
					newTimeline.push(elt.instructions.after);
				}
			}
			// no instruction objects? just push it!
			else{
				newTimeline.push(elt);
			}
		})
		return newTimeline;
	}
	
	/**
	 * Goes through the timeline provided by the server and produces a new timeline while doing a few things:
	 * If a block was marked as has_practice, it creates a practice block using the given handler, and puts it before the actual block
	 * If the block has instructions, it creates jsPsych instruction blocks before and/or after the practice block (or the actual block if it was not marked as has_practice)
	 * 
	 * 
	 */
	core.unpack = function unpack(timeline, handler){
		var newTimeline =[];
		timeline.forEach(function(elt, i, arr){
			var block = $.extend({}, elt);
			if(block.instructions && block.instructions.before){
				newTimeline.push(elt.instructions.before);
			}
			if(block.has_practice){
				var practice = $.extend(true, {}, block);
				practice.is_practice = true;
				if(handler){
					handler(practice)
				}
				newTimeline.push(practice);
				if(block.instructions && block.instructions.after){
					newTimeline.push(elt.instructions.after);
				}
				newTimeline.push(block);
			}
			else{
				newTimeline.push(block);
				if(elt.instructions && elt.instructions.after){
					newTimeline.push(elt.instructions.after);
				}
			}
		});
		return newTimeline;
	};
	
	/**
	 * Inserts a given number of repeats of a particular trial (like a questionnaire or pause) within a given timeline. These inerstions are evenly spaced throughout the timeline
	 * 
	 * @param {Object}		opts			Parameters for this function
	 * @param {Object}		opts.trial		The jsPsych trial object that should be inserted
	 * @param {number}		opts.reps		How many repeats of this trial should be inserted
	 * @param {Object[]}	opts.timeline	The timeline to intersperse with the trial
	 * @param {String}		opts.mode		
	 * 
	 * @return {Object[]}	A new jsPsych timeline with the changes
	 * 
	 * @function intersperse
	 * @memeberof! Percept
	 * @author Daniel Rivas
	 */
	core.intersperse = function(opts){
		
		opts.mode = opts.mode || "centered";
		if(opts.timeline.length < opts.reps) throw "Cannot insert more trials than the length of the timeline";
		
		var timeline = opts.timeline.map(a => Object.assign({}, a));
		var gap = Math.floor(opts.timeline.length / (opts.reps + (opts.mode == "centered" ? 1: -1)));

		var start = opts.mode === "centered" ? gap : 0;
		var index  = start;
		
		while(opts.reps > 0){
			
			timeline.splice(index, 0, opts.trial);
			
			index += 1+gap;
			opts.reps--;
		}
		return timeline
	}
	
	/**
	 * Requests a setting object from the server in order to start an experiment. 
	 * 
	 * @function request
	 * @memberof! Percept
	 * @param {string} 		reqversion		A string indicating the 'name' field of the global setting object to fetch from the server. With this you can choose which version of the experiment to fetch
	 * @param {function}	callback	A function to execute after receiving an answer. Will be called only if the server does not respond with an error. Default behavior is to display a dialog box with the error content. Receives the full server answer as the sole argument
	 */
	core.request = function request(callback, reqversion){
		if(sandbox){
			reqversion = $("#id_sandbox-version").val();
		}
		
		//default value of reqversion is 'final'
		reqversion = reqversion || 'final';
		
		
		$.ajax({
			data:{
				version: reqversion
			},
			dataType: 'json',
			error: function(jqHXR, status, thrown){
				alert("server could not be reached at: /webexp/"+expLabel+'/request\n\nError: '+status+' thrown');
			},
			method: 'GET',
			success: function(resp){
				if(resp.error != undefined){
					$("<div><p>ERROR</p><p>"+resp.error+"</p></div>").dialog({
						modal:true
					});
				}
				else{
					
					//if there is something in the alternative settings box, parse it and use it instead
					var altSettings = $("#altsettings");
					if(altSettings.length > 0 && altSettings.val() !== ""){
						
						try{
							var replacement = JSON.parse(altSettings.val());
						}
						catch(err){
							alert("The contents of the alternative settings is not valid JSON")
						}
						resp = replacement;
					}
					
					meta = resp;
					resp.timeline = core.unpack(resp.timeline);
					callback(resp)
				}
			},
			url: '/webexp/'+expLabel+'/request'
		});
	}
	
	/**
	 * Sends collected data back to the server to be saved, taking care of filling the meta object based on what was received by the previous .request() call.
	 * Displays a jquery-ui dialog box to indicate the result of the operation with a link towards the profile page.
	 * @param	{Object}		opts			Object to hold the parameters
	 * @param	{jsPsych-data}	opts.data		An array of objects as returned by a call to jsPsych.data.getData() or like the sole argument to the on_finish callback that can be passed to jsPsych.init()
	 * @param	{Object}		opts.toSave		Optional object to be merged with the metadata and will be saved for further use in the next run if needed.
	 * @param	{*=}			opts.local		the lastChance function will be called with this as second parameter if given
	 * @param	{boolean}		opts.complete	True if this run marks the end of the experimentation (if spread across sessions). Defaults to True
	 * @param	{number|False}	opts.previous	A number to identify the participation this data should be added to, if this was a continuation. False if not applicable
	 */
	core.save = function save(opts){
		if(meta == "" || meta == undefined){
			alert("metadata was not set by a previous call to djPsych.request");
		} 
		
		payload = {};
		payload.data = opts.data.values();
		var metadata = {};
		metadata.browser = get_browser_info();
		metadata.name = meta.name;
		metadata.subject = meta.subject;
		metadata.current_exp = meta.current_exp;
		metadata.exp_id = meta.exp_id;
		metadata.previous = meta.previous || false;
		metadata.completed = (typeof opts.complete == 'undefined') ? true : opts.complete
		payload.meta = metadata;
		if(typeof opts.toSave != "undefined"){
			metadata.extraParams = opts.toSave
		}
		
		if(!sandbox){
			var $dialog = $('<div><p>Sending data...</p><img src="'+staticUrl+'style/ajax-loader.gif" height="10px" width="10px"/></div>');
			$dialog.dialog({
				modal:true,
				closeOnEscape: false,
				draggable: false
			})
			
			$.ajax({
				url: '/webexp/'+expLabel+'/save',
				method: 'POST',
				type: 'POST',
				data: {
					data: JSON.stringify(payload.data),
					meta: JSON.stringify(payload.meta)
				},
				dataType: 'json',
				error: function(jqHXR, status, thrown){
					$dialog.html("server could not be reached at: /webexp/"+expLabel+'/save\n\nError: '+status+' '+thrown);
				},
				success: function(resp){
					if(resp.error){
						$dialog.html("<p>"+resp.error+'</p><p><a href="/webexp">'+"Back to homepage"+'</a>');
					}
					else{
						$dialog.html("<p>"+resp.success+'</p><p><a href="/webexp">'+"Back to homepage"+'</a>');
					}	
				}
			});
		}
		else{
			// djPsych was started in sandbox mode, dont actually send the request, but gather data and display it in the <textarea>
			chosenFormat = $("#id_sandbox-format").val();
			var datadump = jsPsych.data.get();
			if(chosenFormat == 'csv'){
				$('#datadump').val(datadump.csv());
			}
			else if(chosenFormat =='json'){
				$("#datadump").val(datadump.json());
			}
		}
		
	}
	
	return core
})(jQuery)

var serverPsych = Percept;