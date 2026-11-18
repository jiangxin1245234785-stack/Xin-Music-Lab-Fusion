'use strict';
const styles = Object.freeze(['starry', 'overprint', 'glass', 'paper', 'ember', 'water', 'mist', 'terrain']);
module.exports = {styles, normalize: value => styles.includes(value) ? value : 'starry'};
