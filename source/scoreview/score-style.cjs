'use strict';
const styles = Object.freeze(['starry', 'plain', 'overprint', 'glass', 'paper', 'ember', 'water', 'mist', 'terrain', 'flag']);
module.exports = {styles, normalize: value => styles.includes(value) ? value : 'starry'};
