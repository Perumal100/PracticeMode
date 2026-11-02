CRITICAL ENHANCEMENT: Automatic Multi-Step and Multi-Page Form Extraction
Add the following functionality to the existing PracticeMode Chrome Extension implementation requirements.
Main Objective
The extension must support automated discovery and extraction of multi-step, multi-page, conditional, and dynamically generated web forms.
Many real-world forms require users to complete mandatory fields before subsequent steps become accessible.
The scraper must be capable of generating and entering suitable fictional test data, navigating through supported form steps, and collecting the complete accessible form structure.
The objective is to extract the form definition, NOT to complete or submit a real application.
1. Automatic Multi-Step Form Discovery
When the user activates "Extract Complete Form":
Detect the current form and its available fields.
Extract and preserve all relevant field information before interacting with the page.
Detect mandatory fields that block progression.
Generate suitable fictional data for supported input fields.
Populate the necessary fields.
Trigger framework-compatible input and change events.
Identify the action that advances to the next form step.
Check whether the action is safe to perform under the configured permissions.
Navigate to the next step when permitted.
Wait for the next step to render.
Extract the newly accessible fields.
Repeat until the form reaches its final review stage, an unsupported barrier, or a configured stopping condition.
Combine all captured steps into one structured extraction result.
Support forms where the next step appears through:
React, Angular, Vue, or JavaScript state changes
AJAX updates
DOM replacement
Client-side route changes
Full-page navigation
Different URLs within the same workflow
Tabbed or accordion-based step navigation
Conditional fields and sections
Maintain extraction state across page reloads and navigations.
Do not assume every Next button has type="button". Some forms use type="submit" for intermediate progression.
However, never treat a button as safe merely because it is labeled "Next."
2. Intelligent Fictional Data Generation
Create a modular dummy-data generator capable of producing synthetic, validation-compatible values.
Examples:
Field
Fictional Example
First Name
Alex
Last Name
Example
Email
[alex@example.com](mailto:alex@example.com)
Phone
212-555-0100
Date of Birth
1995-05-15
ZIP Code
10001
City
New York
Graduation Year
2020
Employment Status
Select a declared option
The generator should examine:
Input type
Required status
Min/max length
Min/max numeric values
Regular expression patterns
Date restrictions
Available dropdown options
Radio button groups
Checkbox relationships
Declared validation requirements
Use only fictional, non-sensitive testing values.
Do not generate real identity numbers, credentials, payment details, or actual user information.
For identity-sensitive fields, use safe designated test values only in authorized test environments. Otherwise stop and request manual assistance.
Do not generate fictional data for fields that cannot be safely understood.
The dummy-data generator must remain separate from the extraction engine so it can be modified or disabled independently.
3. Automatic Form Navigation
Develop a step-navigation engine that:
Detects Next, Continue, Proceed, and comparable actions.
Distinguishes step navigation from final form submission.
Supports dynamic rendering and full-page navigation.
Waits for meaningful DOM changes rather than relying only on fixed delays.
Maintains its progress after refreshes.
Detects navigation loops.
Prevents repeatedly capturing the same step.
Handles validation failures without crashing.
Supports manual intervention when automation cannot continue.
When the form rejects fictional input:
Inspect any available validation feedback.
Determine whether the issue relates to a supported declared constraint.
Generate an alternative appropriate fictional value if safe.
Retry within a configurable small limit.
Stop with a meaningful warning if progression remains blocked.
Never bypass CAPTCHA, security checks, identity verification, authentication requirements, or anti-automation protections.
4. Conditional Questions and Branching
Many forms reveal different questions depending on earlier responses.
Example:
"Are you currently employed?"
Selecting "Yes" may reveal:
Employer name
Job title
Employment start date
Selecting "No" may reveal:
Last employment date
Reason for unemployment
The scraper should support capturing multiple accessible branches when safe and practical.
Requirements:
Identify conditional changes when answers are modified.
Record which user-observed choice revealed a field.
Preserve conditional relationships.
Avoid treating all conditional fields as simultaneously required.
Prevent duplicate field extraction.
Restore previous branch state when feasible.
Clearly mark branches not explored or only partially extracted.
Do not claim all branches were discovered unless the tested states establish that coverage.
5. Multi-Page Extraction State
Store temporary progress across steps, including:
Source form identifier
Current step
Previously visited steps
Captured fields
Captured sections
Form navigation relationships
Observed conditional dependencies
Extraction warnings
Inaccessible or unsupported steps
Use appropriately scoped temporary extension storage.
Do not store actual user answers or sensitive page data.
The user should be able to stop extraction, discard temporary state, or export the partial result.
6. CRITICAL: Safe Navigation and Submission Protection
Automatic field filling and progression can trigger real network requests and sometimes create records on the source website.
Therefore, implement these rules:
Default behavior:
Automated filling and navigation are enabled only on explicitly authorized test/demo websites or clearly safe, user-approved workflows.
For external production websites, require explicit user consent before entering fictional data or triggering progression that may transmit data.
Explain that even intermediate Next actions may send information to the website.
Never perform final submission, payment, account creation, booking, or another irreversible action.
Never trigger an action merely because its label appears harmless.
If the extension cannot confidently distinguish navigation from submission or another side effect, pause and ask the user to continue manually.
Do not bypass authentication, CAPTCHA, or other access restrictions.
Stop before any final Submit, Finish, Apply, Confirm, Pay, or comparable completion action.
Never automatically upload files or transmit identity-sensitive values to production websites.
On approved local test fixtures, allow full automated navigation through the final review screen without actually submitting the form.
The extraction process must prioritize safety over reaching every step.
7. Consolidated Output
Export a single JSON document containing the accessible form structure from all discovered steps.
Preserve:
Original page URLs where safe to include
Form title and descriptions
Step titles
Step order
Field order
Labels
Help text
Input types
Available choices
Required flags
Validation constraints
Conditional relationships
Navigation relationships
Extraction status
Unvisited or unsupported steps
Warnings
Example conceptual structure:
{ "formTitle": "Job Application", "extractionStatus": "partial", "steps": [ { "step": 1, "title": "Personal Information", "fields": [ { "label": "First Name", "type": "text", "required": true } ] }, { "step": 2, "title": "Education", "fields": [ { "label": "Highest Qualification", "type": "select", "options": [ "High School", "Bachelor's", "Master's" ] } ] } ], "unvisitedSteps": [ { "title": "Identity Verification", "reason": "Requires manual verification" } ] }
This JSON is illustrative, NOT the final application schema.
The final PracticeMode storage, normalization, and rendering formats will be decided later.
Keep these concerns independent.
8. Extension UI Improvements
Add:
"Scan Current Step"
"Extract Complete Form"
"Enable Safe Auto-Navigation" option
"Pause Extraction"
"Resume Extraction"
"Stop Extraction"
"Export Partial Results"
"Download Complete JSON"
Display the current extraction progress:
Detected steps
Captured steps
Fields captured
Active step
Current warning or blocker
Whether user approval is needed
Make the progress understandable without opening developer tools.
9. Testing
Build automated test forms covering:
Three-step form with required fields
Form with dynamic Next button
React-controlled inputs
Conditional Yes/No sections
Multi-page form with full reloads
Form with validation errors
Form with custom dropdowns
Form with inaccessible steps
Form with a final Submit button
Form with a required file upload
Form with cyclic navigation
Form with multiple conditional branches
Test that the extension:
Extracts fields before navigation.
Generates valid fictional values for supported controls.
Advances through authorized test steps.
Preserves the extracted information across navigation.
Correctly handles validation failures.
Does not lose previously extracted fields.
Does not duplicate fields unnecessarily.
Stops at final submission.
Never bypasses restricted steps.
Clearly reports incomplete extraction.
Exports valid consolidated JSON.
10. Final Implementation Requirement
Treat multi-step extraction as a core capability, not an optional feature.
Build an actual working implementation, not a hardcoded demonstration.
Use a modular architecture that separates:
Field extraction
Dummy-data generation
Field population
Step detection
Navigation control
Conditional branch tracking
Temporary extraction state
JSON export
Safety and user-approval logic
Prioritize reliable extraction of supported forms, safe exploration, transparent limitations, and preservation of all discovered information.
Implement the functionality, run the tests, fix identified issues, and document any unsupported scenarios.

Also for multiple pages, we need to do it step by step and move to next page by filling dummy data into current page till we reach end of form
also all the options in each select field should be stored, not just field
all the options in options field should be scraped