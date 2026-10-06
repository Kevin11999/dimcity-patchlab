// Makes the soft music bed of the first-look video with ffmpeg alone (no samples, no licence): slow pads over four chords.
//   node tools/make-music.mjs [seconds] [out.opus]
import { execFileSync } from 'child_process';
const secs = Number(process.argv[2]) || 130, out = process.argv[3] || new URL('./video-assets/promo-bed.opus', import.meta.url).pathname;
const chords = [[110, 164.81, 220, 261.63, 329.63], [87.31, 130.81, 174.61, 220, 261.63], [130.81, 196, 261.63, 329.63, 392], [98, 146.83, 196, 246.94, 293.66]];
const seg = 8, len = 13, n = Math.ceil(secs / seg), inputs = [], parts = [];
for(let i = 0; i < n; i++){
  const c = chords[i % chords.length];
  const expr = c.map((f, j) => `${(0.16 / (1 + j * 0.35)).toFixed(3)}*(sin(2*PI*${f}*t)+0.35*sin(2*PI*${(f * 2.003).toFixed(2)}*t+1)+0.12*sin(2*PI*${(f * 3.01).toFixed(2)}*t+2))`).join('+');
  inputs.push('-f', 'lavfi', '-i', `aevalsrc=exprs=(${expr})|(${expr.replace(/\+1\)/g, '+1.3)')}):s=44100:d=${len}`);
  parts.push(`[${i}:a]afade=t=in:d=4.5,afade=t=out:st=${len - 4.5}:d=4.5,adelay=${i * seg * 1000}:all=1[p${i}]`);
}
const mix = parts.join(';') + `;${parts.map((_, i) => `[p${i}]`).join('')}amix=inputs=${n}:normalize=0:dropout_transition=0,lowpass=f=2400,tremolo=f=0.18:d=0.25,aecho=0.8:0.7:420|770:0.35|0.22,afade=t=in:d=3,afade=t=out:st=${secs - 5}:d=5,atrim=0:${secs},volume=0.9[m]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', mix, '-map', '[m]', '-c:a', 'libopus', '-b:a', '96k', out], { stdio: 'inherit' });
console.log('written', out);
