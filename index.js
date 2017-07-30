const util = require('util');
const EventEmitter = require('events').EventEmitter;
const fastparallel = require('fastparallel');

const IntSequencer = function (config) {
    if (!(this instanceof IntSequencer)) {
        return new IntSequencer(config);
    }

    const that = this;

    const ticksPerSecond = 25;

    const transitions = {};

    function transitionTick() {
        const data = [];
        let finished;
        const callbacks = [];

        Object.keys(transitions).forEach(channel => {
            transitions[channel].val += transitions[channel].step;

            if (transitions[channel].step > 0) {
                finished = transitions[channel].val >= transitions[channel].finish;
            } else {
                finished = transitions[channel].val <= transitions[channel].finish;
            }

            if (finished) {
                data[channel] = transitions[channel].finish;
                if (typeof transitions[channel].callback === 'function') {
                    callbacks.push(transitions[channel].callback);
                }
                delete transitions[channel];
            } else {
                data[channel] = Math.round(transitions[channel].val);
            }
        });

        if (data.length > 0) {
            config.setter(data);
        }

        callbacks.forEach(cb => {
            cb(null, null);
        });
    }

    setInterval(transitionTick, 1000 / ticksPerSecond);

    this.setScene = function (args, callback) {
        const scene = config.scenes[args[0]];
        const transition = args[1];
        const tmp = [];
        if (transition) {
            scene.forEach((finish, ch) => {
                if (finish !== null && finish !== undefined) {
                    tmp.push([ch, finish, transition]);
                }
            });
            fastparallel.each(tmp, startTransition, callback);
        } else {
            config.setter(scene);
            if (typeof callback === 'function') {
                callback();
            }
        }

        function startTransition(args, callback) {
            let [ch, finish, transition] = args;

            transition = parseFloat(transition) || 1;
            const start = (config.data && config.data[ch]) || 0;
            const step = (finish - start) / ticksPerSecond / transition;

            if (transitions[ch]) {
                that.emit('transition-conflict', ch);
                if (typeof callback === 'function') {
                    callback();
                }
            } else {
                transitions[ch] = {val: start, step, finish, callback};
            }
        }
    };

    // eslint-disable-next-line func-name-matching, max-params
    this.newSequence = function NewSequence(sequence, repeat, shuffle, speed, callback) {
        if (!(this instanceof NewSequence)) {
            return new NewSequence(sequence, repeat, shuffle, speed, callback);
        }

        const seq = config.sequences[sequence];

        if (!seq) {
            that.emit('sequence-missing', seq);
            return;
        }

        speed = speed || 1;
        repeat = repeat || 0;

        let pause = false;
        let step = -1;

        seqStep();

        function seqStep() {
            const len = seq.length;
            step += 1;

            if (step >= len) {
                if (repeat) {
                    step = 0;
                } else {
                    if (typeof callback === 'function') {
                        callback(null, null);
                    }
                    return;
                }
            }

            let index;
            if (shuffle) {
                index = Math.floor(Math.random() * seq.length);
            } else {
                index = step;
            }
            const duration = (seq[index][2] * 1000 / speed) || 0;
            that.emit('step', {sequence, scene: seq[index][0], index, action: 'trans'});
            that.setScene([seq[index][0], (seq[index][1] / speed) || 0], () => {
                that.emit('step', {sequence, scene: seq[index][0], index, action: 'hold'});
                setTimeout(() => {
                    if (!pause) {
                        that.emit('step', {sequence, scene: seq[index][0], index, action: 'finish'});
                        seqStep();
                    }
                }, duration);
            });
        }

        // Jumps to the end of the sequence, disables repeat and calls sequence callback
        this.stop = function () {
            step = seq.length;
            repeat = false;
        };

        this.pause = function () {
            pause = true;
        };

        this.resume = function () {
            pause = false;
            seqStep();
        };

        this.next = function () {
            seqStep();
        };

        this.speed = function (s) {
            speed = s;
        };
        this.shuffle = function (s) {
            shuffle = s;
        };
        this.repeat = function (r) {
            repeat = r;
        };

        return this;
    };
};

util.inherits(IntSequencer, EventEmitter);

module.exports = IntSequencer;
