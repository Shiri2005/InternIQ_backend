const fs = require('fs');
const path = require('path');
const { analyzeResumeLocally } = require('./src/utils/resumeAnalysis');

(async () => {
  const sample = 'Experienced developer with HTML, CSS, and AWS experience. Worked on Ubuntu Linux servers.';
  const buffer = Buffer.from(sample, 'utf8');
  const skillPool = ['HTML','CSS','Ubuntu','Flask','Aws EC2'];

  const result = await analyzeResumeLocally(buffer, skillPool, 'sample.txt');
  console.log(JSON.stringify(result, null, 2));
})();
