// Will at the Switchback: in the back of the truck, among the parcels.
// How to write this is explained in index.ts.
const words = `
# hello
[wave] Hey! Cold enough for you? | Oh, hi! Don't mind me. | [happy] You found the lay-by.

# start
[wave] Hello! Welcome to the Switchback.
I'm supposed to be delivering these.
I'm *also* supposed to be on level four.
-> menu

# again
Still snowing? Good. | Back for more snow? | [happy] Hey again.
-> menu

# menu
> What are you doing back here? -> truck
> Can I drive the truck? -> drive
> Is that a fox? -> fox
> Where does the tunnel go? -> tunnel
> Stay warm. -> bye

# truck
It's warmer than it looks. Parcels are *excellent* insulation.
And nobody asks you to do things when you're cargo.

# drive
[nod] Keys are in it. I'll stay back here.
Take the corners gently. I'm not strapped in.
(He does not look worried.)

# fox
[happy] That's a fox.
He knows somewhere good. Follow him if he goes.

# tunnel
Up to the Relay. It's quiet up there. Good sky.

# bye
[wave] Mind the ice! | [wave] Drive safe. Or don't, I'm in the back.
-> end
`;

export default words;
