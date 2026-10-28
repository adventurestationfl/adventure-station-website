# Your Adventure Station studio desk

This guide describes the new system. It is a development preview until your sign-in, business details and payments have been checked and approved. Use made-up information while reviewing it.

## Sign in

Open the staff sign-in address provided during setup. Sign in with the email on your team invitation. You do not need a new website password. If you see “Staff sign-in is not configured yet,” setup is still needed; contact the person helping with the website.

## Create a workshop

Choose **Workshops → Create workshop**. Give it a name and a short description. Add the full description, age range, usual duration, price and number of places. Choose an image if you have one. Keep it as a Draft while you work. Choose Published when the workshop information is ready, then **Save workshop**.

You only describe an activity once. You can keep reusing it. Changing its defaults does not change dates or registrations already saved.

## Add a new class date

Open **Workshops**, find the activity, and choose **Add date**. Select the date, start and end time, and venue. The usual price and number of places are already filled in. Change them only if this date is different. Choose Published and **Save class date**.

To schedule several dates together, enter the extra dates one per line in **More dates**. They will use the same time, venue, price and capacity. All dates in that save must be valid.

The first published class needs your confirmed Florida city, timezone, policies and venue. The form will tell you what needs attention. Past classes stay in your records and cannot accept new registrations.

## Change a class

Choose **Class dates → Edit**. Change the number of places, assigned instructor or availability. You cannot reduce capacity below existing bookings and active reservations.

If a date has no registrations, you can also change its time, venue or price. Once it has registrations, these details are protected. Cancel the old class and make a new date when a material change is needed. Contact affected families and review their payments before making other arrangements.

**Duplicate** starts a new date from an existing one. It does not copy participants or payments.

## Add or replace a photograph

Choose **Images**. Use artwork, crafts, materials, venues or a non-identifying photograph. Identifiable child photos are deferred. Select an image, add a short description of what it shows, and confirm that you have permission to publish it and that it does not identify a child. Choose **Upload image**. The website prepares smaller versions automatically and removes image metadata.

To use it, open the workshop or **Website content** and choose the image. You can also select images for a workshop gallery. Save the workshop or publish the website changes.

Only upload images meant for the public website. Do not upload attendance lists, private documents or images of children without the necessary permission. Removing an unused image is permanent. An image still used by a workshop, page or saved page version is protected from removal.

## Edit website words and policies

Open **Website content**. Edit the headline, welcome text, story, contact details, questions or promotional heading. Choose an accent color and homepage image if you wish. Choose **Publish website changes** when ready, then **View website** to check the result.

Only the owner can confirm the city, timezone and policies. Do not approve policy text until it accurately describes the business. Earlier versions are kept at the bottom of the page: restore one into the form, review it, and publish it to apply the change.

Freeport is configured for Central Time. Recommended policies are preloaded as private drafts. **Load recommended policy drafts** restores the current suggested wording and leaves approval off. It replaces saved policy text, keeps the previous saved version in history, and discards unsaved form edits after you confirm. Complete every **[OWNER: ...]** instruction and review the proposed parent-present model and refund terms before checking the approval box. The public website does not display unapproved policy text.

## Review registrations and attendance

Choose **Registrations** to search for a guardian, workshop or registration reference. Look at both the registration state and the verified payment information.

Choose **Class dates → Attendance** to see confirmed participants. Check **Attended** as children arrive. The change saves immediately. Instructors can see only their assigned classes and the participant details needed for attendance.

## Understand payment states

| State          | What it means                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Pending        | Checkout has started. Payment and places are not confirmed yet.                                                         |
| Confirmed      | Payment was verified and the places are reserved.                                                                       |
| Expired        | The temporary reservation ended. If the guardian says they paid, check payment updates before asking them to pay again. |
| Payment review | There is a payment or availability problem to resolve. No place is promised by this state.                              |
| Cancelled      | The registration or class was cancelled. A refund may still need attention.                                             |
| Refunded       | A full refund was verified and the places were released.                                                                |

**Check payment updates** asks Square for the latest information. Never tell a family that a place is confirmed just because they returned from checkout or sent a screenshot.

For a paid registration in Payment review, **Confirm available places** is available when verified payment supports confirmation. Speak with the guardian, then use this action if appropriate. The system checks availability again before saving and refuses to oversell the class. If no places remain, arrange a refund or another agreed solution. **Follow-up complete** clears an attention flag only after the registration and payment issue are resolved.

The development preview uses test payments only. **Sandbox refund** cannot refund real money. Refund requests are not complete until the payment information confirms them. The production refund process will be explained after production payment setup is approved.

The overview shows gross verified sales before refunds and processing fees. It does not show net bank deposits or estimated fees.

## Cancel a class safely

Open **Class dates → Edit**, choose Cancelled, and save. Read the confirmation carefully. The date stops accepting new bookings. Registrations and payment records stay available and are marked for follow-up.

Cancellation records a message for every affected booking. It does not automatically refund money. Open **Messages** to check follow-up, and review each payment before agreeing a refund or alternative. Customer sending remains disabled in this development release, so contact families manually before relying on a notification.

## Keep personal details only as long as needed

Review old registrations after the period in your privacy settings. When a historical registration no longer needs personal details, the owner can choose **Remove personal details**. This permanently removes guardian contact details and children’s names and ages from that registration. Financial facts remain. Do not use this while a payment problem is unresolved. Ask your website helper about backup copies and any legal recordkeeping requirements.

## Give a team member access

The owner opens **Team access → Add team member**, enters their name and sign-in email, and chooses Owner, Manager or Instructor. Give instructors only the access they need. Disable access when someone leaves. Your website helper may need to allow the same email in the sign-in service during initial setup.

## Get Adventure Station ready

Open **Setup** from the staff menu, or use **Get Adventure Station ready** on Overview. Each task shows what remains and links to the right screen. Save a little at a time with **Save setup progress**; your notes remain when you return. You can minimize the dashboard section from Setup.

Confirm your business contacts, locations, supervision, operating review and privacy arrangements. The licensing section records what you report; it does not certify an exemption. Changing supervision reopens the relevant reviews and makes policies private again. Review the policy drafts in Website content only after the operating arrangements are settled.

You can edit the website, upload permitted images and prepare workshop/date drafts throughout setup. Website personalization can wait. Payments, staff sign-in, email testing, recovery and launch checks need developer help; you never need to enter keys or use a terminal. Completing owner tasks does not authorize live registration or launch.

## Cancel one child or adjust a refund

In **Registrations**, choose **Review booking**. Select only the places that need cancelling and choose **Cancel selected places**. Confirm the number before continuing. For three children, selecting one releases one place; the other two stay unchanged. The original order and payment remain in history.

A refund is a separate owner action on that screen. Check the adopted policy and the agreed amount first. Select the payment and enter the amount. This release supports sandbox requests only. **Requested**, **Processing** and **Completed** have different meanings. If the outcome needs review, use **Check same refund request**; do not start another request for the same adjustment. A partial refund does not automatically cancel a child’s place.

Booked times, venues and prices are locked to protect family agreements. To change them materially, cancel the old date, review every affected family’s refund or expressly agreed alternative, then create a new date. A family is never treated as having accepted an alternative automatically.

## Messages and privacy follow-up

**Messages** lists confirmations, cancellations and refund updates. A booking is confirmed only after verified payment and available places. An email marked **Accepted** has been accepted by the provider; it is not yet proof of delivery. **Review**, **Bounced** or **Suppressed** needs another contact method. **Retry safely** preserves the same message reference and is available only while a retry is safe. Your developer must finish provider setup and testing before customer sending is enabled.

**Privacy review** distinguishes records due for review from records already anonymized. Review outstanding issues and legitimate retention reasons first. Removing personal details preserves financial history and a restricted removal record. It does not erase old backups or the processor’s own records. Ask your developer to maintain the recovery process; do not restore an old backup yourself.
