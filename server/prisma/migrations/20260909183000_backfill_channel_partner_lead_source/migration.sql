UPDATE "Lead"
SET "leadSource" = 'Channel Partner Referral'
WHERE "channelPartner" IS NOT NULL
  AND trim("channelPartner") <> ''
  AND ("leadSource" IS NULL OR trim("leadSource") = '' OR "leadSource" = 'Manual entry');
