# StitchTrack — Interview Questions and Answers

## 1. How would you structure design tokens?

I would start by separating the actual design values from how they are used.

For example, in StitchTrack, I have primitive tokens that hold values like colours, font sizes, and shadows. Then I have semantic tokens that tell me what those values are meant for, like Primary, On Primary, or Background.

So instead of giving a button a hex colour directly, I would let it use the Primary colour role.

I believe this makes changes easier to manage. If I update the primary colour later, the components using that role can follow the change without me editing them one by one.

## 2. When is a token change breaking?

I would consider it a breaking change when it affects something that already depends on that token.

For example, if I rename or remove a token without updating the components using it, those components could lose their styling.

Even changing a colour value can cause problems. The code might still work, but the new colour could have poor contrast or look wrong on some screens.

So before changing an existing token, I would check where it's used and test the affected components.

## 3. How would you support multiple brands and themes?

I would keep the semantic colour roles the same, but allow each brand or theme to have its own values behind those roles.

For example, StitchTrack currently uses Tailored Wine. If I wanted to support another brand that uses blue, I wouldn't want to rewrite every component just to change its colours.

Instead, each brand could have its own palette mapped to the same roles, like Primary, Background, and On Primary.

I would also test the colour combinations because a colour that works for one brand might not have enough contrast for another.

This isn't something I've implemented in StitchTrack yet, but that's how I would approach it.

## 4. Can tokens guarantee accessible contrast?

No, I don't think tokens alone can guarantee that.

They help us stay consistent, but contrast depends on the two colours being used together.

For example, white text on our primary wine colour has a contrast ratio of about 6.44:1. That works for normal text under WCAG AA.

But if I take the same wine colour and place it on a different background, I need to check that combination again.

So I would use tokens to define suitable colour pairs, but I would still test them in the actual interface.

## 5. How do you ensure that colour contrast guidelines are met within a website or application's design?

I would check the text colour against the background it's sitting on, not just look at whether the colours seem readable to me.

For normal text, WCAG AA generally requires a contrast ratio of at least 4.5:1, while large text requires 3:1.

I would check combinations like white text on the primary colour and dark text on the page background. I would also check things like buttons, status labels, and form fields.

And I wouldn't depend only on colour to communicate something important. For example, an order should say "Approved" rather than just showing a green indicator.

## 6. Can you discuss the differences between WCAG levels A, AA and AAA?

WCAG means Web Content Accessibility Guidelines. It gives us requirements to help make websites usable by people with different abilities.

From what I understand, Level A covers the basic requirements, like providing text alternatives for images that carry information and making functionality usable with a keyboard.

Level AA builds on that. It includes requirements like the 4.5:1 contrast ratio for normal text. 

Level AAA is stricter. For example, it generally expects 7:1 contrast for normal text.

The levels build on each other, so AAA includes the requirements from A and AA. I also understand that meeting contrast requirements alone doesn't mean the whole application is accessible.

## 7. Discuss the importance of semantic HTML in the context of accessibility.

Semantic HTML is about using the right HTML element for what the content is meant to do.

For example, if someone needs to approve something or take action on a web interface, I should use a `button` tag, not just a `div` styled to look like a button.

The button already has behaviour that helps with keyboard interaction and assistive technology.

It's the same with headings, navigation, form labels, and tables. Using the correct elements helps browsers and screen readers understand the page.

I still use `div` elements for layout, but where an element has a clear meaning or function, I try to use the appropriate HTML tag.

## 8. How do you handle design handoff to developers using Figma?

I would make sure the developer has more than just screenshots of the design.

They should be able to see the colour roles, typography styles, spacing decisions, component behaviour, and how the interface should respond on different screens.

For StitchTrack, I created variables and text styles in Figma, exported the complete tokens as JSON, and used a JavaScript script to convert them into CSS variables.

Then I gave those tokens to a coding agent to build the styled dashboard.

I also checked the result instead of assuming the agent followed everything. For example, I searched the interface code for hardcoded colours and asked the agent to identify the typography style used for a particular heading.

## 9. Why do AI-generated interfaces tend to look generic, and what specifically do you hand an agent to stop it?

I think one reason is that the agent doesn't really know the product or its design direction unless we give it that context.

So it falls back to common layouts, colours, and styles that could belong to almost any application.

I noticed this with StitchTrack. The first dashboard the agent built had a generic blue-and-grey appearance because I hadn't asked it to use our design system.

After that, I gave it the generated tokens and instructed it to use our semantic colours, DM Sans typography, and shadows.

I would also put those rules in the project's agent instructions so they apply beyond a single prompt.

But I still need to check the output, because having the rules doesn't automatically mean the agent followed them.

## 10. Your line height for Display Large is a specific number. Why that number and not one step either side of it? What would you lose with each?

For StitchTrack, Display Large is 52px, and I used a line-height multiplier of 1.4. That's how I arrived at 72.8px.

My thinking was to give large headings enough space when they wrap, without separating the lines too much.

If I used 1.3, the line height would be 67.6px. That might save space, but the lines could feel too close together.

At 1.5, it would be 78px. That gives more space, but it could make the heading take up more room than necessary.

I wouldn't say 72.8px is the perfect value. It's the choice I made for this design, and I would still test it with real content and different screen sizes.

## 11. Point at one place in your own token structure that you would build differently if you started again. Say what you would do instead and what it would cost.

One thing I would change is how I handled the shadow colours.

In StitchTrack, the shadows have their own exported hex values with opacity. They work visually, but they don't automatically update when I change the primary colour token.

If I were starting again, I would separate the shadow colour from its other properties, like blur, offset, and spread. Then I could reference a semantic shadow colour.

That would make things easier if I later introduced different brands or themes.

The downside is that it adds more tokens and some complexity to the conversion script. I would also need to test the shadows across themes.

So it's an improvement I would plan for, but not necessarily something I need to rebuild immediately.

## 12. Wrong-answer analysis

**A candidate says exporting hex values from Figma into one CSS file creates a single source of truth. What is missing, and what will go wrong in month four?**

I think putting all the colours in one CSS file is a good start, but it doesn't fully solve the problem.

What's missing is the meaning behind those colours and how components are expected to use them.

For example, if developers are just using colour values directly, one person might use wine for a button, another for a border, and someone else might add a new hex value when the existing one doesn't look right.

After a few months, when the brand colours change, some parts of the interface might update while others don't.

I would structure the tokens into primitives and semantic roles, keep the approved token definitions as the source, and generate the CSS from them.

I would also test the references and check that components aren't bypassing the system.

That's similar to what I demonstrated in my StitchTrack broken-reference experiment.