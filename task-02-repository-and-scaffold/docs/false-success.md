What I Tested

For this part of Task Two, I added a simple tailoring enquiry form to StitchTrack and connected it to a PostgreSQL database using Prisma.

I wanted to confirm that submitting the form actually saved information instead of only displaying a success message.

I first submitted test enquiries using different customer names. The requests returned HTTP 201 Created, and I checked Prisma Studio to confirm that the records were stored.

For example, Blessing Malik's enquiry was saved with ID 3, while a later enquiry from Adebanjo James was saved with ID 5. The two records were created more than 24 minutes apart.

What Happened When I Broke the Connection

Next, I deliberately changed the application's test database port to 65432, where no database server was listening.

During my first attempt, the application returned HTTP 500 because some required database configuration variables were missing. After restoring the correct configuration, I repeated the test with the unavailable port.

The second attempt also returned HTTP 500, but the server log recorded the outcome as internal_error.

The form itself still loaded successfully with HTTP 200. However, when I submitted the enquiry, the application displayed this message:

"The enquiry could not be confirmed. Check the request ID before retrying."

It also displayed a request ID that matched the server log.

What Actually Happened in the Database

After the failed submission, I refreshed Prisma Studio to check whether the enquiry had been saved.

The database still contained the same five records. There was no new record for the failed enquiry.

This confirmed that the application had not successfully saved the submitted information.

How Someone Could Be Misled

If someone reviewing the application only opened the form, they might assume the feature was working because the page loaded and the fields were interactive.

However, the interface alone cannot prove that the database is working.

In my test, the application correctly displayed an error instead of falsely claiming that the enquiry had been saved. This means I did not reproduce the exact false-success behaviour described in the assessment.

I also noticed that the unavailable database condition was reported as HTTP 500 rather than the more specific 503 response I expected. This needs further investigation.

What I Learned

I understand the difference between a page that loads, an API request that succeeds, and a record that is actually stored.

A successful HTTP 200 page load does not prove that a form can save information. I need to check the submission's HTTP status, the server logs, and the database records before concluding that a feature works.

For StitchTrack, I was able to prove both sides: successful requests created real database records, while the failed request did not create a record and did not show a false success message.