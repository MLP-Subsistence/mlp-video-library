# App Review Notes — Marketplace Literacy 1.0 (Build 9)

Thank you for the Guideline 4.2 feedback. Build 9 replaces the prior library-first
experience with a native learning and field-practice workflow. The app does not
embed or navigate the Marketplace Literacy website.

## Native workflow to review

1. Open **Learn**. Choose a learning language and daily lesson goal.
2. The app creates a 12-step learning path and recommends the next lesson.
3. Open a lesson. After viewing the lesson, complete the native **Turn this lesson
   into action** activity. A learner must record a useful idea and a next action
   before the lesson can be completed.
4. Open **Workbook** and create a field plan. It captures a customer, customer
   need, offer, price test, interview question, next action, target date, and
   completion state.
5. Open **Progress** to see completed lessons, the daily goal, learning streak,
   field tests, saved lessons, and a dated completion history.

## Native and offline behavior

- Learning paths, reflections, field plans, saved lessons, daily goals, streaks,
  and completion history are implemented in SwiftUI and persist on device.
- Reflections and field plans remain available without a network connection.
- The lesson catalog is cached after the first successful load.
- Video playback requires a network connection. WebKit is used only for inline
  YouTube video playback inside the native lesson detail screen.
- No account or sign-in is required for review.

Suggested review path: **Learn → first lesson → Turn this lesson into action →
Complete lesson → Workbook → Create a field plan → Progress**.
