'use strict';
// Read back an MP4 the way a player's demuxer would, for the checks (not used by the export).
// Walks the boxes, decodes each track's tables and checks that every sample lies inside mdat.
//
//   node source/scoreview/export/tests/mp4-read.cjs <file.mp4>   → prints JSON
const fs = require('node:fs');

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);

function boxes(buffer, start, end, depth = 0, out = []) {
  let at = start;
  while (at + 8 <= end) {
    let size = buffer.readUInt32BE(at);
    const type = buffer.toString('latin1', at + 4, at + 8);
    let header = 8;
    if (size === 1) { size = Number(buffer.readBigUInt64BE(at + 8)); header = 16; }
    if (size === 0) size = end - at;
    if (size < header || at + size > end) throw new Error(`bad box ${type} at ${at} size ${size}`);
    const item = {type, at, size, body: at + header, end: at + size, depth, children: []};
    out.push(item);
    if (CONTAINERS.has(type)) boxes(buffer, item.body, item.end, depth + 1, item.children);
    if (type === 'stsd') boxes(buffer, item.body + 8, item.end, depth + 1, item.children);
    if (type === 'avc1') boxes(buffer, item.body + 78, item.end, depth + 1, item.children);
    if (type === 'mp4a') boxes(buffer, item.body + 28, item.end, depth + 1, item.children);
    at += size;
  }
  return out;
}

const find = (list, type) => list.find(item => item.type === type);
const path = (list, ...types) => types.reduce((node, type) => node && find(node.children || node, type), {children: list});

function table(buffer, item, width) {
  const count = buffer.readUInt32BE(item.body + 4);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const row = [];
    for (let j = 0; j < width; j++) row.push(buffer.readUInt32BE(item.body + 8 + (i * width + j) * 4));
    rows.push(row);
  }
  return rows;
}

function readTrack(buffer, trak) {
  const tkhd = find(trak.children, 'tkhd');
  const mdhd = path(trak.children, 'mdia', 'mdhd');
  const handler = buffer.toString('latin1', path(trak.children, 'mdia', 'hdlr').body + 8, path(trak.children, 'mdia', 'hdlr').body + 12);
  const stbl = path(trak.children, 'mdia', 'minf', 'stbl');
  const stsd = find(stbl.children, 'stsd');
  const entry = stsd.children[0];
  const track = {
    id: buffer.readUInt32BE(tkhd.body + 12), tkhdDuration: buffer.readUInt32BE(tkhd.body + 20),
    handler, timescale: buffer.readUInt32BE(mdhd.body + 12), mediaDuration: buffer.readUInt32BE(mdhd.body + 16), entry: entry.type
  };
  if (entry.type === 'avc1') {
    track.width = buffer.readUInt16BE(entry.body + 24);
    track.height = buffer.readUInt16BE(entry.body + 26);
    const avcC = find(entry.children, 'avcC');
    track.avcProfile = buffer[avcC.body + 1];
    track.avcLevel = buffer[avcC.body + 3];
    track.codec = `avc1.${[1, 2, 3].map(i => buffer[avcC.body + i].toString(16).padStart(2, '0')).join('')}`;
    const colr = find(entry.children, 'colr');
    if (colr) track.colr = {type: buffer.toString('latin1', colr.body, colr.body + 4), primaries: buffer.readUInt16BE(colr.body + 4), transfer: buffer.readUInt16BE(colr.body + 6), matrix: buffer.readUInt16BE(colr.body + 8), fullRange: Boolean(buffer[colr.body + 10] & 0x80)};
  }
  if (entry.type === 'mp4a') {
    track.channels = buffer.readUInt16BE(entry.body + 16);
    track.sampleRate = buffer.readUInt32BE(entry.body + 24) >>> 16;
    const esds = find(entry.children, 'esds');
    // ES_Descriptor → DecoderConfigDescriptor → objectTypeIndication, then DecSpecificInfo.
    const bytes = buffer.subarray(esds.body + 4, esds.end);
    // Single-byte descriptor lengths: 03 len id(2) flags | 04 len oti type buf(3) max(4) avg(4) | 05 len asc…
    if (bytes[0] !== 0x03 || bytes[5] !== 0x04 || bytes[20] !== 0x05) throw new Error('esds layout not understood');
    track.objectType = bytes[7];
    const asc = bytes.subarray(22, 22 + bytes[21]);
    if (asc && asc.length >= 2) {
      track.aacObjectType = asc[0] >> 3;
      track.codec = `mp4a.40.${track.aacObjectType}`;
    }
  }
  const stts = table(buffer, find(stbl.children, 'stts'), 2);
  track.samples = stts.reduce((sum, [count]) => sum + count, 0);
  track.sttsDuration = stts.reduce((sum, [count, delta]) => sum + count * delta, 0);
  track.deltas = [...new Set(stts.map(row => row[1]))];
  const stss = find(stbl.children, 'stss');
  if (stss) track.syncSamples = table(buffer, stss, 1).map(row => row[0]);
  const stsc = table(buffer, find(stbl.children, 'stsc'), 3);
  const stszItem = find(stbl.children, 'stsz');
  const fixed = buffer.readUInt32BE(stszItem.body + 4), sizeCount = buffer.readUInt32BE(stszItem.body + 8);
  const sizes = [];
  for (let i = 0; i < sizeCount; i++) sizes.push(fixed || buffer.readUInt32BE(stszItem.body + 12 + i * 4));
  const offsets = table(buffer, find(stbl.children, 'stco'), 1).map(row => row[0]);
  // Every sample's byte range, from the chunk table.
  const ranges = [];
  let sample = 0;
  for (let c = 0; c < offsets.length; c++) {
    let perChunk = 0;
    for (const [first, count] of stsc) if (first - 1 <= c) perChunk = count;
    let at = offsets[c];
    for (let i = 0; i < perChunk && sample < sizes.length; i++, sample++) { ranges.push([at, sizes[sample]]); at += sizes[sample]; }
  }
  track.sizesCount = sizes.length;
  track.mappedSamples = ranges.length;
  track.bytes = sizes.reduce((sum, value) => sum + value, 0);
  track.ranges = ranges;
  const elst = path(trak.children, 'edts', 'elst');
  if (elst) track.edit = {segmentDuration: buffer.readUInt32BE(elst.body + 8), mediaTime: buffer.readInt32BE(elst.body + 12)};
  return track;
}

function readMp4(file) {
  const buffer = fs.readFileSync(file);
  const top = boxes(buffer, 0, buffer.length);
  const ftyp = find(top, 'ftyp'), moov = find(top, 'moov'), mdat = find(top, 'mdat');
  const mvhd = find(moov.children, 'mvhd');
  const info = {
    bytes: buffer.length, order: top.map(item => item.type), brand: buffer.toString('latin1', ftyp.body, ftyp.body + 4),
    movieTimescale: buffer.readUInt32BE(mvhd.body + 12), movieDuration: buffer.readUInt32BE(mvhd.body + 16),
    mdat: {start: mdat.body, end: mdat.end}, tracks: moov.children.filter(item => item.type === 'trak').map(trak => readTrack(buffer, trak))
  };
  // Every sample inside mdat, no two samples overlapping, and mdat fully used.
  const all = info.tracks.flatMap(track => track.ranges).sort((a, b) => a[0] - b[0]);
  let problems = 0, cursor = mdat.body;
  for (const [at, size] of all) { if (at !== cursor) problems++; cursor = at + size; }
  if (cursor !== mdat.end) problems++;
  info.layoutProblems = problems;
  for (const track of info.tracks) delete track.ranges;
  return info;
}

module.exports = {readMp4, boxes};

if (require.main === module) console.log(JSON.stringify(readMp4(process.argv[2]), null, 1));
