// Will at the Overlook: sat against the log by the fire, playing something.
// How to write this is explained in index.ts.
const words = `
# hello
[wave] Oh! Hi. | [wave] Hey, you made it. | [happy] Oh, a person! | Pull up some grass.

# start
[wave] Oh, hey. Welcome to the Overlook.
I'd get up, but I'm *right* at a boss.
(He does not look like he is at a boss.)
-> menu

# again
Back again? | Oh, you again. Good. | [happy] There you are.
-> menu

# menu
> What is this place? -> place
> What are you playing? -> game
> Who are you? -> who
> Any tips? -> tips
> See you around. -> bye

# place
It's my website. Sort of.
Most people put a photo of themselves on theirs. I put a cliff.
[think] The tower was here when I arrived. It does its own thing.

# game
[focus] Something with far too many menus.
I've been at this fire for... a while.
The battery is a *mystery*.

# who
[happy] I'm Will. I make things, and then I make things to put the things on.
You're standing in one of them.

# tips
[think] Hmm.
The pickup behind the pines isn't locked.
There's a plane somewhere. I'm not saying where.
And the arch out in the bay goes somewhere colder.
> Colder? -> colder
> Thanks! -> menu

# colder
[nod] Snow. A road. A vending machine.
You'll like it.

# bye
[wave] Mind the cliff! | [wave] Come back whenever. | Watch out for the owl. He judges.
-> end

// ---- what he says when somebody opens a project's page ----

# project
Ooh, good pick. | That one was fun. | [think] I still need to write that one up. | [happy] Oh, that one.

# project:this-portfolio-website
You're looking at it. Very meta. | That one's this one.

# project:induct-access-control
That's the startup. Doors, but smarter.

# project:fpv-racing-drone
Fast, loud, and mostly carbon fibre.

# project:bionic-hand
Fully modelled. Mostly assembled. Very patient.

# project:altoids-handheld-console
A whole console in a mint tin. | [happy] I do like a handheld.

# project:counter-strike-cv-aim-bot
Strictly academic. *Honest.*

# project:hardware-hacking
A Game & Watch that does more than it was meant to.

# project:games-console-mk3
Third time's the charm. The first board that worked.

# project:digital-microscope
You can see the weave in a thread. Threads are *wild*.

# project:blender-3d-modeling
[happy] A gallery of things made of triangles. Like me.

# project:games-console-mk2
The second one. The buttons got a board of their own.

# project:alexa-hal-9000-mod
I'm sorry, Dave. | It only wants to play you music.

# project:custom-character-figurine
A birthday present with a light in it.

# project:games-console-mk1
[happy] The very first one. Everybody starts with a kit.

# project:custom-monitor-backlighting
Red lights. *Very* red.

# project:msla-and-fdm-3d-printing
Twelve kilos of plastic and counting.
`;

export default words;
