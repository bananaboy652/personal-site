// Will at the Relay: flat on his back in the grass, looking at the sky.
// How to write this is explained in index.ts.
const words = `
# hello
(He lifts a paw without looking away from the sky.) | Shh. Stars. | [happy] Oh, hi. Lie down, it's better.

# start
Hey.
I'd wave properly, but I've only just got comfortable.
There's room. Lie down. It's better from here.
-> menu

# again
Still here. Still stars. | [happy] Back again?
-> menu

# menu
> What are you looking at? -> looking
> What is this place? -> place
> Is that your cat? -> cat
> Leave him to it. -> bye

# looking
The sky. It's the good one tonight.
If you watch long enough, some of the stars *move*.
Those are satellites. Don't tell them I called them stars.

# place
[think] A relay station. It passes things along.
I used to watch a mast like that one from my bedroom window. One red light, all night.
It's just out here. Broadcasting. Always on.
I think that's nice.

# cat
Nobody's cat. Everybody's cat.
Runs the station. I just lie here.

# bye
(He lifts a paw.) | [sleepy] Mm. Night.
-> end

// ---- lying beside him ----

# stars
(You lie back. The grass is cold and the sky is enormous.)
Good, isn't it.
> How long have you been out here? -> long
> What's that one that's moving? -> moving
> Did you see that? -> meteor
> Just watch for a while. -> end

# long
[sleepy] Since the blue went out of it.
I'll go in when my tail goes numb.

# moving
A satellite. Somebody's weather, or somebody's telly.
It's so quiet up there, and it's *so* busy.

# meteor
[surprised] I did!
[happy] Make a wish. I used mine on the cat.
`;

export default words;
