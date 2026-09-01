import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyChannelPartnerToken } from "../lib/channelPartnerSignToken.js";
import { hashPassword } from "../lib/auth.js";

export const channelPartnerAgreementRouter = Router();

// Same limitation as routes/nda.js's clickwrap flow: typed name + checkbox +
// IP + timestamp, not a certified e-signature (no identity verification, no
// signing certificate). Good enough to record that whoever held this link
// asserted agreement; not a substitute for a real e-signature vendor if this
// needs to hold up as a certified signature in a dispute.
function requireValidToken(req, res, next) {
  if (!verifyChannelPartnerToken(req.params.partnerId, req.params.token)) {
    return res.status(403).send("<p>Invalid or expired agreement link.</p>");
  }
  next();
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Matches the real app's own branding (LoginPage.jsx's split-screen shell:
// green circle badge + "Global Capital BV", #1b295f accents) — this page is
// a channel partner's first real contact with the product, before they've
// ever seen the SPA itself, so it shouldn't look like a bare unstyled form.
function pageShell(body) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Channel Partner Agreement</title>
  </head>
  <body style="font-family:'Segoe UI',Arial,sans-serif;background:#f7f9fc;padding:48px 20px;margin:0;color:#12213a;">
    <div style="max-width:760px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
        <div style="width:44px;height:44px;border-radius:16px;background:#ebf6ef;display:flex;align-items:center;justify-content:center;">
          <div style="width:28px;height:28px;border-radius:999px;background:#ffffff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#2b9b60;">GC</div>
        </div>
        <p style="font-size:14px;font-weight:600;color:#102246;margin:0;">Global Capital BV</p>
      </div>
      <div style="background:#ffffff;border:1px solid #e7edf5;border-radius:16px;padding:32px;box-shadow:0 4px 16px rgba(30,48,87,0.06);">
        ${body}
      </div>
    </div>
  </body>
</html>`;
}

// A short, centered confirmation card (success, already-signed, or an
// error) — distinct from the wide agreement/form layout above, since these
// have no long document or fields to fit.
function noticeCard({ icon, iconBg, iconColor, title, body }) {
  return `
    <div style="text-align:center;padding:12px 0;">
      <div style="width:56px;height:56px;border-radius:999px;background:${iconBg};display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:26px;color:${iconColor};">${icon}</div>
      <h1 style="font-size:20px;font-weight:600;color:#102246;margin:0 0 12px;">${title}</h1>
      <div style="font-size:14px;line-height:1.7;color:#4f6181;">${body}</div>
    </div>`;
}

function unknownRecipientNotice() {
  return pageShell(
    noticeCard({
      icon: "!",
      iconBg: "#fdeceb",
      iconColor: "#e0483f",
      title: "Unknown recipient",
      body: "This link doesn't match any channel partner on file. Ask whoever sent it for a fresh link."
    })
  );
}

// The real Channel Partner Agreement text (from "Channel Partner(Boutique
// Firms) Agreement copy.docx"), with the partner's own name and territory
// filled in where the template has them — everything else ([Partner's
// Address], [monthly/quarterly], etc.) is left as the template's own
// unresolved placeholder, since this app doesn't collect that data.
function buildAgreementText({ partnerName, territory, signedDate }) {
  const partnerLine = partnerName || "[Partner's Name/Company Name]";
  const territoryLine = territory || "[Specify Territory, e.g., worldwide or specific countries/regions]";

  return `Channel Partner Agreement

This Channel Partner Agreement ("Agreement") is made on ${signedDate}, by and between:

Company Name: Global Capital BV, with principal office at Hofplein 20, 3032 AC, Rotterdam Netherlands.
Channel Partner: ${partnerLine}, with principal office at [Partner's Address]

1. Definitions

"Agreement" means this Channel Partner Agreement, including all schedules, annexures, amendments, and addenda hereto.

"Channel Partner" means the independent contractor, company, or individual entering into this Agreement with Global Capital BV to identify and refer prospective clients requiring funding solutions.

"Company" or "Global Capital BV" refers to Global Capital BV, with principal office at Hofplein 20, 3032 AC, Rotterdam Netherlands, including its successors and assigns.

"Client" means any individual, business entity, or organization identified and referred by the Channel Partner to Global Capital BV for the purposes of availing funding, restructuring, acquisition of accounts, or other financial solutions.

"Effective Date" means the date on which this Agreement is executed by both Parties.

"Funding Solutions" or "Services" refers to the financial services, loan arrangements, restructuring, acquisition of NPA accounts, bridge loans, debt-equity structuring, and any other funding-related services offered by Global Capital BV to Clients.

"Lead" means any potential client or business opportunity introduced by the Channel Partner to Global Capital BV in accordance with this Agreement.

"Letter of Intent" or "LOI" means a formal document signed by a referred Client acknowledging their understanding of the funding process and willingness to proceed with Global Capital BV under applicable terms and conditions.

"Territory" means the geographical region(s) specified in this Agreement in which the Channel Partner is authorized to operate and refer clients.

"Incentives/Commission" means the financial compensation payable to the Channel Partner by Global Capital BV, as set out in Clause 7 of this Agreement, based on successfully completed funding transactions.

"Maintenance Fee" means the additional payments payable to the Channel Partner based on volume and performance, as defined under Clause 7.4 of this Agreement.

"Sub-Channel Partner" means any person, firm, or entity recruited, trained, or engaged by the Channel Partner to assist in identifying prospective clients, operating under the responsibility and supervision of the Channel Partner.

"Confidential Information" means all non-public information relating to the Company, its clients, processes, trade secrets, business opportunities, strategies, data, or any related financial or operational information disclosed to the Channel Partner as defined under Clause 8.

2. Scope of Partnership

2.1 Sales Territory: The Channel Partner is authorized to promote and refer clients requiring funding solutions within ${territoryLine}.

2.2 Services Covered: The Channel Partner will represent the funding services provided by Global Capital BV.

2.3 Exclusivity: This partnership is non-exclusive within the assigned territory.

3. Reserved Rights

Global Capital BV reserves the right to solicit/engage with other Channel Partners directly from within the territory.

4. Independent Contractor

Channel Partner is an independent contractor, and nothing contained in this Agreement shall be construed to: give either party the power to direct and control the day-to-day activities of the other; constitute the parties as partners, joint ventures, co-owners or otherwise; or allow Channel Partner to create or assume any obligation on behalf of Company for any purpose whatsoever. Channel Partner is not an employee of Company and is not entitled to any employee benefits. Channel Partner shall be responsible for paying all income taxes and other taxes charged to Channel Partner on amounts earned hereunder. All financial and other obligations associated with Channel Partner's business are the sole responsibility of Channel Partner.

5. Responsibilities of the Channel Partner

5.1 Client Identification: The Channel Partner will use reasonable efforts to identify and introduce businesses requiring funding solutions. They are responsible for acquiring new clients and maintaining a strong data base. The channel partner can look for clients who required not only straight forward funding but also services and support for, including but not limited to, handling, restructure the loan, acquisition of NPA Accounts as well as giving the bridge loan.

5.2 Compliance with NDAs: The Channel Partner will comply with Non-Disclosure Agreements (NDAs) as required by prospective clients to maintain confidentiality.

5.3 Professional Conduct: The Channel Partner will act as a representative of Global Capital BV and shall follow the branding guidelines to increase the business's reputation. They shall explain to the client the fund's philosophy and the services that the fund provides. Such presentations about the fund should be tailor made to the prevailing market conditions in which the client operates.

5.4 Completion of Client File: The Channel Partner shall ensure that the client provides all the requisite documents as required by the fund in order to process the client file and proceed with the funding process.

5.5 Due Diligence of Client: The Channel partner shall conduct an initial due diligence of the client to ensure client genuineness and sincerity. They shall ensure that all the Legal and Regulatory Compliances have been duly made by the client. The channel partner needs to gain an insight about the borrower's existing financial condition as to its outstanding debt liabilities, any NPAs, any possible funding opportunities available to the client.

5.6 Signing of LOI: After conducting the due diligence, collecting the requisite documents, making the client understand the fund philosophy, the Channel Partner shall get a signed copy of the LOI (Letter of Intent to Invest) from the client as an acknowledgement from the client that they understand the funding process and the terms and conditions attached to it.

5.7 Transparency: The Channel Partner shall ensure a complete transparency of any and all information that flows from the client in relation to the funding and the client's business.

5.8 Market Expansion: The Channel Partner shall provide insights about the market the fund wants to invest in and help the fund navigate the market to gain the best possible investment opportunities. In this way, they can expand into the geographical areas where the fund does not have a direct presence. They can also collaborate with the fund to increase its presence in the new geographical areas.

5.9 Expansion of Channel Partner Network: If the Channel Partner wishes to expand their own network in order to increase the client flow, they are free to do so with the following additional responsibilities: they will be responsible for providing appropriate training to such individuals; such sub-channel partners shall be considered an extension of the Master Channel Partner and hence such Master Channel Partner shall be held responsible for any and all actions taken by the recruited Sub-Channel Partners.

5.10 No Unsolicited commercial transactions: The Channel Partner shall not recover any kinds of fees, costs or charges from the client directly by utilising the fund's name, without the knowledge of the fund as a part of processing of the funding request under false pretences. If such a transaction comes to the attention of the fund, then this agreement shall be voided with immediate effect and a strict legal action may be taken against the Channel Partner. This clause has been introduced to ensure that the fund's reputation is kept intact.

6. Responsibilities of Global Capital BV

6.1 Support and Training: Global Capital BV will provide necessary training, support, and marketing materials to the Channel Partner.

6.2 Incentive Structure: Global Capital BV will ensure timely and transparent payment of incentives to the Channel Partner based on referrals.

6.3 Lead Conversion: The company will process referred leads promptly and keep the Channel Partner updated about the status.

7. Compensation and Payment Terms

7.1 Sole Compensation: The Company shall pay the Channel Partner a commission at such rate as may be communicated by the Company in writing to the Channel Partner, for whole or part of the services hereto, based on the incentive structure as given below. This incentive will be subjected to the relevant taxes as applicable. The Company reserves its right to revise the rate of commission from time to time and the same shall be intimated to the Channel Partner in writing by the Company.

7.2 Basis of Compensation: The Commission shall apply to all completed transactions of funding/investing by Channel Partner. No commissions shall be paid on (i) orders solicited directly by Company within the Territory; (ii) orders received from outside the Territory unless otherwise agreed in writing by Company; (iii) no commission will be paid to the Channel Partner until all the necessary activities in relation to the funding/investing have been completed. The company reserves the right to change the commission/prices on products as and when required.

7.3 Incentive Structure: The Channel Partner will receive the following incentives based on the borrowing requirements of referred clients: 10 million to 50 million: 1% of the borrowing amount. 50 million to 100 million: 0.75% of the borrowing amount. 100 million and above: 0.5% of the borrowing amount. If in case the client opts for a Debt-Equity structure in borrowing, allotting a share in Equity could be negotiated too.

7.4 Maintenance Fee: The Channel Partner will receive an additional maintenance fee based on the volume of clients referred (10 clients or more) and their performance, which is to be negotiated separately.

7.5 Payment Schedule: Incentives will be paid based on clients procured and work done. Maintenance fees will be paid on a [monthly/quarterly] basis.

7.6 Equity Participation: An Equity Participation post investment of 2% or more as a form of Sweat Equity maybe offered based on performance.

7.7 Board of Directors representation: Up to 2 Board of directors seat maybe offered. Our investment policy involves getting a board seat for the fund in order to have an oversight on the asset invested in. An additional board seat maybe offered to the channel partner to add value to the oversight and can serve as a physical presence for the fund. Such board seat shall not attract, in any case, any financial or legal liability. The rights of such board seat shall be decided based on the investment made and expectations of the stakeholders.

8. Confidentiality and non-disclosure

Channel Partner acknowledges that by reason of its relationship to Company hereunder it will have access to certain information and materials concerning Company's business plans, customers, technology, and products/services that is confidential and of substantial value to Company, which value would be impaired if such information were disclosed to third parties. Channel Partner agrees that it shall not use in any way for its own account or the account of any third party, nor disclose to any third party, any such confidential information revealed to it by the Company.

Company shall advise Channel Partner whether or not it considers any particular information or materials to be confidential. Channel Partner shall not publish any description of the Products/Services beyond the description published by Company and without the prior written consent of the Company. In the event of termination of this Agreement, there shall be no use or disclosure by Channel Partner of any confidential information of Company.

9. Indemnification by Channel Partner

The Channel Partner will indemnify Global Capital BV and hold it harmless from and against all loss, damage, liability, cost or expense of any nature whatsoever, including, without limitation, any and all reasonable attorney's fees and court costs, arising out of or in connection with (i) the inaccuracy or breach of any representation, warranty or obligation of the Channel Partner hereunder and/or (ii) the activities of the Channel Partner in connection with the promotion, sale or collection of payment of the Services in violation of this Agreement, law or any other duty or obligation of the Channel Partner.

10. Intellectual Property Rights

Global Capital BV retains all rights to its trademarks, copyrights, and proprietary information shared during the partnership.

11. Term and Termination

11.1 Term: The Term of this Agreement will be for two years from the Effective Date. This Agreement may be renewed for successive one-year terms by both parties agreeing in writing to such renewal until the termination date. Notwithstanding the foregoing, Global Capital BV reserves the right to modify or amend the Channel Partner Program from time to time. Global Capital BV shall notify the Channel Partner of such modifications or amendments to Channel Partner Program. If any such modification or amendment to the Channel Partner Program is unacceptable to Channel Partner, Channel Partner's sole and exclusive remedy shall be to terminate this Agreement within thirty (30) days after such modification.

11.2 Termination for Cause: Either Party may immediately terminate the Agreement in cases of material breach of this Agreement by the other Party. For the sake of clarity, the non-payment of any kind by Channel Partner or from Client within the scheduled date is considered a material breach. In cases of exceptional circumstances either Party may evoke such termination, for: a) bankruptcy; b) death, retirement, illness, or incapacity of the other Party or key personnel and c) the acceptance of bribes and/or conviction for any criminal offence.

11.3 Termination without Cause: Either Party may terminate the Agreement, for any reason or no reason, and without any liability towards the other Party, by giving the other Party a thirty (30) day prior written notice.

11.4 Return of Materials: All of Company's trademarks, trade names, data, photographs, literature, and sales aids, customer related database of every kind shall remain the property of Company. Within five (5) days after the termination of this Agreement, Direct Selling Agent shall return all such items to company. Direct Selling Agent shall not make or retain any copies of any confidential items or information that may have been entrusted to it. Effective upon the termination of this Agreement, Direct Selling Agent shall cease to use all trademarks, marks and trade name of Company.

11.5 Effect of Termination: Upon the termination of this Agreement for any reason: (a) the Channel Partner will immediately discontinue making any representations regarding its status as set forth in this Agreement and will immediately cease any activities related to this Agreement; (b) all amounts owed by either party to the other will become immediately due and payable; (c) any assigned prospects hereunder may be pursued by Global Capital BV or transferred to another Channel Partner in Global Capital BV's sole discretion. Termination or expiration is not an exclusive remedy and all other remedies will be available whether or not termination occurs.

11.6 Performance Period: Irrespective of the Term of this Agreement, the parties will set Channel Partner performance review periods, for which Channel Partner may earn specific incentives as set forth in this agreement. The Performance Period will be set for one (1) quarter, commencing on the Effective Date.

13. Mutual Promotion

9.1 Each Party shall provide the other with a commercially reasonable quantity of its marketing materials to best enable the other Party's sales and marketing teams to familiarize themselves with, and promote its Services and/or Global Capital BV Services, as applicable. If the Parties determine it to be mutually beneficial, they shall develop joint materials to promote both Parties' offerings with the costs of any such materials to be mutually agreed upon between the Parties. Neither Party shall create materials that refer to the other Party's offerings without first obtaining approval of said materials from the other Party.

9.2 The Parties shall consult with each other on at least an annual basis to review the effectiveness of the cross-promotion activities and to discuss, where applicable, other opportunities that might be available for the mutual benefit of the Parties.

14. Limitation of Liability

In the event of termination by either party in accordance with any of the provisions of this Agreement, neither party shall be liable to the other, because of the termination for compensation, reimbursement or damages on account of the loss of prospective profits or anticipated sales or on account of expenditures or commitments in connection with the business or goodwill of Company or Channel Partner.

15. Governing Law

This Agreement shall be governed by and construed in accordance with the laws of India. Any disputes arising under or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts located in Mumbai, Maharashtra.

16. Signatures

Global Capital BV
Name: Amol Kadam
Title: CEO

Channel Partner
Name: ${partnerLine}`;
}

// The link an admin generates and sends from ChannelPartnerModule.jsx (see
// POST /api/channel-partners/:id/agreement-link).
channelPartnerAgreementRouter.get("/:partnerId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const partner = await prisma.channelPartner.findUnique({ where: { id: req.params.partnerId } });
  if (!partner) {
    return res.status(404).send(unknownRecipientNotice());
  }

  if (partner.agreementSignedAt) {
    return res.send(
      pageShell(
        noticeCard({
          icon: "✓",
          iconBg: "#dff5e7",
          iconColor: "#2b9b60",
          title: "Already signed",
          body: `This Channel Partner Agreement was already signed by <strong>${escapeHtml(partner.agreementSignedName)}</strong> on ${partner.agreementSignedAt.toDateString()}. No further action is needed.`
        })
      )
    );
  }

  const agreementText = buildAgreementText({
    partnerName: partner.name,
    territory: partner.region,
    signedDate: new Date().toDateString()
  });

  const signError = req.query.error ? String(req.query.error) : null;

  const inputStyle =
    "display:block;margin-top:6px;width:100%;padding:10px 12px;border:1px solid #d6deea;border-radius:10px;box-sizing:border-box;font-size:14px;color:#102246;font-family:inherit;";
  const labelStyle = "display:block;margin:0 0 14px;font-size:13px;font-weight:600;color:#334463;";

  res.send(
    pageShell(`
      <span style="display:inline-block;background:#eef2ff;color:#3046b2;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px;">Channel Partner Agreement</span>
      <h1 style="font-size:24px;font-weight:600;color:#102246;margin:14px 0 4px;letter-spacing:-0.01em;">${escapeHtml(partner.name)}</h1>
      <p style="font-size:13px;color:#8592ab;margin:0 0 20px;">Review the agreement below, then sign it and set up your portal login.</p>

      <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.6;color:#435471;background:#f8faff;border:1px solid #e7edf5;border-radius:12px;padding:18px;max-height:420px;overflow-y:auto;margin:0 0 24px;">${escapeHtml(agreementText)}</pre>

      ${signError ? `<p style="background:#fdeceb;color:#e0483f;font-size:13px;font-weight:500;padding:10px 14px;border-radius:10px;margin:0 0 16px;">${escapeHtml(signError)}</p>` : ""}

      <form method="POST">
        <label style="${labelStyle}">
          Type your full name to sign
          <input name="fullName" required style="${inputStyle}font-weight:400;" />
        </label>
        <label style="display:flex;align-items:flex-start;gap:8px;margin:0 0 24px;font-size:13px;color:#4f6181;font-weight:400;">
          <input type="checkbox" name="agree" required style="margin-top:2px;" />
          I have read and agree to the terms of this Channel Partner Agreement
        </label>

        <div style="border-top:1px solid #e7edf5;padding-top:20px;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#102246;">Set up your portal login</p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#8592ab;">
            Signing creates your Channel Partner Portal account, where you can add your own leads and run your own
            outreach campaigns.
          </p>
          <label style="${labelStyle}">
            Email
            <input type="email" name="email" required style="${inputStyle}font-weight:400;" placeholder="you@partner.com" />
          </label>
          <label style="${labelStyle.replace("margin:0 0 14px", "margin:0 0 24px")}">
            Password (at least 8 characters)
            <input type="password" name="password" required minlength="8" style="${inputStyle}font-weight:400;" placeholder="••••••••" />
          </label>
        </div>

        <button type="submit" style="width:100%;background:#1b295f;color:#fff;border:none;border-radius:12px;padding:14px 20px;font-size:15px;font-weight:600;cursor:pointer;">
          Sign Agreement &amp; Create Portal Account
        </button>
      </form>
    `)
  );
}));

const signSchema = z.object({
  fullName: z.string().min(1),
  agree: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

channelPartnerAgreementRouter.post("/:partnerId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const parsed = signSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues.some((i) => i.path[0] === "password")
      ? "Password must be at least 8 characters."
      : parsed.error.issues.some((i) => i.path[0] === "email")
        ? "Enter a valid email address."
        : "Please provide your name and agree to the terms.";
    return res.redirect(
      `/api/channel-partner-agreement/${req.params.partnerId}/${req.params.token}?error=${encodeURIComponent(message)}`
    );
  }

  const partner = await prisma.channelPartner.findUnique({ where: { id: req.params.partnerId } });
  if (!partner) {
    return res.status(404).send(unknownRecipientNotice());
  }
  if (partner.agreementSignedAt) {
    return res.send(
      pageShell(
        noticeCard({
          icon: "✓",
          iconBg: "#dff5e7",
          iconColor: "#2b9b60",
          title: "Already signed",
          body: "This Channel Partner Agreement has already been signed. No further action is needed."
        })
      )
    );
  }

  // A ChannelPartnerUser's email is globally unique (see schema.prisma) —
  // checked explicitly so a collision comes back as a normal form error
  // instead of a raw 500 from the create() below.
  const emailTaken = await prisma.channelPartnerUser.findUnique({ where: { email: parsed.data.email } });
  if (emailTaken) {
    return res.redirect(
      `/api/channel-partner-agreement/${req.params.partnerId}/${req.params.token}?error=${encodeURIComponent("That email is already registered to a portal account.")}`
    );
  }

  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "unknown").trim();
  const signedAt = new Date();
  const passwordHash = await hashPassword(parsed.data.password);

  // Signing the agreement and creating the portal login happen together,
  // atomically — there's no separate invite-email step (see the plan's
  // Phase 1 scope note: no established "send a real email to a channel
  // partner contact" pathway exists yet), so this is the one moment a
  // ChannelPartnerUser can ever be created.
  await prisma.$transaction([
    prisma.channelPartner.update({
      where: { id: partner.id },
      data: { agreementSignedAt: signedAt, agreementSignedName: parsed.data.fullName, agreementSignedIp: ip }
    }),
    prisma.channelPartnerUser.create({
      data: { channelPartnerId: partner.id, name: parsed.data.fullName, email: parsed.data.email, passwordHash }
    })
  ]);

  res.send(
    pageShell(
      noticeCard({
        icon: "✓",
        iconBg: "#dff5e7",
        iconColor: "#2b9b60",
        title: "You're all set",
        body: `Thanks, ${escapeHtml(parsed.data.fullName)} — your Channel Partner Agreement has been recorded and your portal account is ready.
          <a href="/partner/login" style="display:inline-block;margin-top:20px;background:#1b295f;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px;">Log in to the Channel Partner Portal →</a>`
      })
    )
  );
}));
