// Thresholds roughly matching what mailbox providers themselves publish as
// "you're about to get blocklisted" lines: Google/Yahoo want spam-complaint
// rate under 0.3% (ideally under 0.1%), and a hard-bounce rate above ~5% is
// a widely-cited signal of a stale/purchased list. minSampleSize avoids
// pausing a brand-new campaign off one unlucky early bounce.
const DEFAULT_THRESHOLDS = {
  minSampleSize: 20,
  bounceRate: 0.05,
  complaintRate: 0.001
};

export function evaluateCampaignHealth({ sentCount, bounceCount, complaintCount }, thresholds = {}) {
  const { minSampleSize, bounceRate: bounceRateThreshold, complaintRate: complaintRateThreshold } = {
    ...DEFAULT_THRESHOLDS,
    ...thresholds
  };

  if (sentCount < minSampleSize) {
    return { shouldPause: false, reason: null };
  }

  const complaintRate = complaintCount / sentCount;
  if (complaintRate > complaintRateThreshold) {
    return {
      shouldPause: true,
      reason: `Spam complaint rate ${(complaintRate * 100).toFixed(2)}% exceeds ${(complaintRateThreshold * 100).toFixed(2)}% threshold (${complaintCount}/${sentCount} sends)`
    };
  }

  const bounceRate = bounceCount / sentCount;
  if (bounceRate > bounceRateThreshold) {
    return {
      shouldPause: true,
      reason: `Bounce rate ${(bounceRate * 100).toFixed(1)}% exceeds ${(bounceRateThreshold * 100).toFixed(1)}% threshold (${bounceCount}/${sentCount} sends)`
    };
  }

  return { shouldPause: false, reason: null };
}
