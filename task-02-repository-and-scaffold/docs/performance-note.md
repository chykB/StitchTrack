First Page Load

I started the StitchTrack application using the Next.js development server on port 3000. To check whether the application was responding properly, I used curl in my WSL terminal to measure the first page load.

The request returned HTTP 200 OK, which means the server successfully responded.

The recorded load time was 789 milliseconds (ms).

Comparing the Result

The assessment uses approximately 10 ms as a performance target. My first recorded page load took 789 ms, which is 779 ms above the target. This shows that the application responded successfully, but the load time was higher than expected.

Although the page loaded successfully, there is still room to improve its performance.

What Might Have Caused the Delay?

One possible reason is that I was running the application in development mode. Next.js may need to compile the page and process its modules before responding to a request.

The time could also include processing the page on the server and handling the HTTP request.

I did not measure each part separately, so I cannot say exactly how much time was spent on compilation or application processing.

What I Learned

This exercise helped me understand that starting a development server successfully does not automatically mean the application is performing well.

Instead of relying only on what I see in the browser, I need to check the HTTP response and measure how long the server takes to respond.

My first recorded request returned HTTP 200 in 789 ms. As a next step, I would compare this with another request and a production build to understand whether the delay is mainly caused by development-mode processing.