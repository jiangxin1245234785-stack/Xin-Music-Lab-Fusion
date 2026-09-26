
'use strict';
const assert=require('assert/strict'),L=require('../track-layout.js');
const l=L.create();assert(l.collapsed('strings'));l.fold('strings',false);assert(!l.collapsed('strings'));
const ids=['analysis:chord','stem:bass','stem:guitar','stem:strings'];l.move(ids,'stem:strings','stem:bass');
assert.deepEqual(l.ordered(ids,x=>x),['analysis:chord','stem:strings','stem:bass','stem:guitar']);
const children=[{laneId:'strings#0'},{laneId:'strings#1'},{laneId:'strings#2'}];
l.move(children.map(l=>l.laneId),'strings#2','strings#0',false,'strings');
assert.deepEqual(l.children('strings',children).map(l=>l.laneId),['strings#2','strings#0','strings#1']);
const restored=L.create(l.snapshot());assert(!restored.collapsed('strings'));assert.deepEqual(restored.snapshot(),l.snapshot());
assert.deepEqual(restored.ordered(['stem:bass','new','stem:strings'],x=>x),['stem:strings','stem:bass','new']);
assert.deepEqual(L.moved(['a','b'],'missing','b'),['a','b']);assert.deepEqual(L.moved(['a','b'],'a','b',true),['b','a']);
assert.deepEqual(children.map(l=>l.laneId),['strings#0','strings#1','strings#2']);
console.log('track layout: PASS (view-only order, group/child identity, folding, restoration and missing rows)');
