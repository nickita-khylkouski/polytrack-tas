// The 17 official PolyTrack tracks (game version 0.6.3). id = the leaderboard track id.
const path = require('node:path');
const VERSION = '0.6.3';
const ENGINE = process.env.PT_ENGINE || path.join(__dirname, '..', '.engine', VERSION);
const TRACKS = [
  { slug: 'summer1', name: 'Summer 1', id: '5803f9e963625804e3de3246d043dc7dde847aa32e991f7f7326b0453f1fa038', url: 'tracks/official/summer1.track' },
  { slug: 'summer2', name: 'Summer 2', id: '7eac4fee1111152cfba4d3737410264ca0f22c7f5a2211e79f0099589b8b48c0', url: 'tracks/official/summer2.track' },
  { slug: 'summer3', name: 'Summer 3', id: '148826aa16ffaa23dbc453b32cff05e025ddbce1773fc7733cc13d218926515a', url: 'tracks/official/summer3.track' },
  { slug: 'summer4', name: 'Summer 4', id: '93c7363dfea7fb09ca1d23b72cad5df43a30841d41c8ff25fb544c85bb03c7ae', url: 'tracks/official/summer4.track' },
  { slug: 'summer5', name: 'Summer 5', id: '7603aaeffa1989a649dfaa8e1804bed4481b49df233e377687d0669899566e52', url: 'tracks/official/summer5.track' },
  { slug: 'summer6', name: 'Summer 6', id: 'c117823cf6788e3247b9ee63a0c091c07352bbe352c650a7790dc6718148c2fa', url: 'tracks/official/summer6.track' },
  { slug: 'summer7', name: 'Summer 7', id: 'e4bcaca3a583bb0eb62a700a69d14e89c852f0c5bf740fca76e0519ebdfc9ab1', url: 'tracks/official/summer7.track' },
  { slug: 'winter1', name: 'Winter 1', id: '7239b17057127936907a805b0caa5d8c6f6c97eca9bdabf1a5312dce479629b7', url: 'tracks/official/winter1.track' },
  { slug: 'winter2', name: 'Winter 2', id: '99864b635d1891d22e17eb9267527a07a92c49c0f02893729fa2ded90e3ca0f9', url: 'tracks/official/winter2.track' },
  { slug: 'winter3', name: 'Winter 3', id: 'a5341fe706097cff2a3812a3fc0d87399254557328351ae8e5c882700fc1a196', url: 'tracks/official/winter3.track' },
  { slug: 'winter4', name: 'Winter 4', id: '7d134c939df80c676a258266201beedd3b93572d5603f3ff4339ff8679803715', url: 'tracks/official/winter4.track' },
  { slug: 'winter5', name: 'Winter 5', id: '2fe4bd46b0075cc25fc770ce50adbb68447cf493c999635bb272d231811dd264', url: 'tracks/official/winter5.track' },
  { slug: 'desert1', name: 'Desert 1', id: 'c20b4ee3cd517ca6cae7e43f047548757287fbd08ba81b97892a3ef520159a34', url: 'tracks/official/desert1.track' },
  { slug: 'desert2', name: 'Desert 2', id: '88647ea04145fbbbb19b55f1590e038fb0378acb2571110f02cb545cc46b0d57', url: 'tracks/official/desert2.track' },
  { slug: 'desert3', name: 'Desert 3', id: '2806030c503abb41a1a26fa9a570888be14296172bb273798ef0ad87a108a2ec', url: 'tracks/official/desert3.track' },
  { slug: 'desert4', name: 'Desert 4', id: '4697ea67b18c3f49b30a3d8884602115536650bc5435c88e3732e64d21a72d33', url: 'tracks/official/desert4.track' },
  { slug: 'desert5', name: 'Desert 5', id: 'e5d084e06db4ab71196fea44efeceb23c8561266a78669c324a38f92581fe2db', url: 'tracks/official/desert5.track' },
];
const BY_SLUG = Object.fromEntries(TRACKS.map(t => [t.slug, t]));
module.exports = { VERSION, ENGINE, TRACKS, BY_SLUG };
