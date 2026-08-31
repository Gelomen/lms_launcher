// @vitest-environment node
// 日志行链接识别（规格 2026-08-31-log-link-ctrl-click-design §3.1）：
// http(s) 链接切分为独立段；尾部标点剥离（Windows Terminal 同款）；非 http 协议不识别。
import { describe, it, expect } from 'vitest';
import { linkify } from './linkify';

describe('linkify', () => {
  it('line_without_link_returns_single_text_segment_unchanged', () => {
    expect(linkify('server ready, listening on :8080')).toEqual([{ text: 'server ready, listening on :8080', isLink: false }]);
    expect(linkify('')).toEqual([{ text: '', isLink: false }]);
  });

  it('single_link_yields_text_link_text_segments_reassembling_line', () => {
    expect(linkify('see http://a/b?q=1 for docs'))
      .toEqual([
        { text: 'see ', isLink: false },
        { text: 'http://a/b?q=1', isLink: true, url: 'http://a/b?q=1' },
        { text: ' for docs', isLink: false },
      ]);
  });

  it('multiple_links_in_one_line', () => {
    expect(linkify('a http://x/1 b https://y/2 c'))
      .toEqual([
        { text: 'a ', isLink: false },
        { text: 'http://x/1', isLink: true, url: 'http://x/1' },
        { text: ' b ', isLink: false },
        { text: 'https://y/2', isLink: true, url: 'https://y/2' },
        { text: ' c', isLink: false },
      ]);
  });

  it('trailing_punctuation_is_stripped_from_url', () => {
    // Windows Terminal 同款：句点/括号不算 URL 一部分
    expect(linkify('visit https://example.com/path. done')).toEqual([
      { text: 'visit ', isLink: false },
      { text: 'https://example.com/path', isLink: true, url: 'https://example.com/path' },
      { text: '. done', isLink: false },
    ]);
    expect(linkify('(see http://a/b/c)')).toEqual([
      { text: '(see ', isLink: false },
      { text: 'http://a/b/c', isLink: true, url: 'http://a/b/c' },
      { text: ')', isLink: false },
    ]);
  });

  it('quotes_do_not_become_part_of_url', () => {
    expect(linkify('"http://a/b"')).toEqual([
      { text: '"', isLink: false },
      { text: 'http://a/b', isLink: true, url: 'http://a/b' },
      { text: '"', isLink: false },
    ]);
  });

  it('non_http_protocols_are_not_recognized', () => {
    expect(linkify('ftp://mirror/x.tar.gz')).toEqual([{ text: 'ftp://mirror/x.tar.gz', isLink: false }]);
    expect(linkify('file:///C:/x.txt')).toEqual([{ text: 'file:///C:/x.txt', isLink: false }]);
    // https? 前缀必须后跟 ://（裸 "http" 字样不识别）
    expect(linkify('http is a protocol')).toEqual([{ text: 'http is a protocol', isLink: false }]);
  });
});
