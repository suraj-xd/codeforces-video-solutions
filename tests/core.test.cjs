const { test } = require('node:test');
const assert = require('node:assert/strict');
const { problemFromUrl, problemFromInput, extractInitialData, videosFromData, rankVideos, viewCount, searchUrl } = require('../codeforces-video-solutions.user.js');

test('identifies regular, contest, gym, and group problems without truncating A1', () => {
  for (const path of ['/problemset/problem/123/A1', '/contest/123/problem/A1', '/gym/123/problem/A1', '/group/abc/contest/123/problem/A1']) {
    assert.equal(problemFromUrl(path, 'A1. A test problem').id, '123A1');
    assert.equal(problemFromUrl(path, 'A1. A test problem').title, 'A test problem');
  }
  assert.equal(problemFromUrl('/contest/123'), null);
  assert.equal(problemFromUrl('/problemset/problem/4/A/other'), null);
});

test('home search accepts IDs and Codeforces URLs but rejects other hosts', () => {
  assert.equal(problemFromInput('4 a Watermelon').title, 'Watermelon');
  assert.equal(problemFromInput('https://codeforces.com/contest/4/problem/A?locale=en').id, '4A');
  assert.equal(problemFromInput('https://evil.example/contest/4/problem/A'), null);
  assert.equal(problemFromInput('https://codeforces.com.evil.example/contest/4/problem/A'), null);
  assert.equal(problemFromInput('watermelon'), null);
});

test('extracts nested JSON with braces and escaped quotes in strings without evaluating code', () => {
  const data = { a: { title: 'A } brace and "quotes" with \\ escapes', videoRenderer: { videoId: 'abcdefghijk' } } };
  for (const prefix of ['var ytInitialData = ', 'window["ytInitialData"] = ', 'ytInitialData = ']) {
    assert.deepEqual(extractInitialData(`<script>${prefix}${JSON.stringify(data)};</script>`), data);
  }
  assert.throws(() => extractInitialData('<h1>Consent required</h1>'), /readable search/);
  assert.throws(() => extractInitialData('var ytInitialData = {broken};'), /readable search/);
});

test('parses classic and modern YouTube cards, deduplicates, and ignores ads and invalid IDs', () => {
  const renderer = { videoId: 'abcdefghijk', title: { runs: [{ text: '4A' }, { text: ' solution' }] }, ownerText: { runs: [{ text: 'A channel' }] }, viewCountText: { simpleText: '1,234 views' } };
  const data = [ { videoRenderer: renderer }, { videoRenderer: renderer },
    { videoRenderer: { ...renderer, videoId: 'javascript:alert(1)' } },
    { adSlotRenderer: { videoRenderer: { ...renderer, videoId: 'ad_________' } } },
    { lockupViewModel: { contentId: '12345678901', contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', metadata: { lockupMetadataViewModel: { title: { content: 'Modern card' }, metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: 'Channel B' } }, { text: { content: '2K views' } }] }] } } } } } } ];
  const result = videosFromData(data);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, '4A solution');
  assert.equal(result[1].channel, 'Channel B');
  assert.equal(result[1].views, '2K views');
});

test('relevance outranks popularity and adjacent IDs do not count as exact matches', () => {
  const p = problemFromInput('4A Watermelon');
  const videos = [
    { id: 'aaaaaaaaaaa', title: 'Watermelon song', views: '10M views' },
    { id: 'bbbbbbbbbbb', title: 'Codeforces 14A Flag solution', views: '1M views' },
    { id: 'ccccccccccc', title: 'Codeforces 4A1 unrelated', views: '1M views' },
    { id: 'ddddddddddd', title: 'Codeforces 4 A Watermelon solution', views: '500 views' },
    { id: 'eeeeeeeeeee', title: 'Codeforces Watermelon explained', views: '10K views' },
  ];
  const results = rankVideos(videos, p);
  assert.deepEqual(results.map((v) => v.id), ['ddddddddddd', 'eeeeeeeeeee']);
  assert.equal(results[0].reason, 'Problem ID match');
  assert.equal(rankVideos(videos, problemFromInput('999Z')).length, 0);
});

test('handles view counts and safely encodes a search query', () => {
  assert.equal(viewCount('1.2M views'), 1200000);
  assert.equal(viewCount('1,234 views'), 1234);
  assert.equal(viewCount('No views'), 0);
  const url = new URL(searchUrl({ id: '4A', title: 'A & B #?' }));
  assert.equal(url.origin, 'https://www.youtube.com');
  assert.equal(url.searchParams.get('search_query'), 'Codeforces 4A A & B #? solution');
});
