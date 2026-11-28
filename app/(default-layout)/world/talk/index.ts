// What Will says. Each world has its own file beside this one, and each is
// plain text between a pair of back-ticks: write it like a script.
//
//   # start                      A beat. "start" is where the first conversation
//                                begins, "again" where every later one does.
//   Oh! A visitor.               A line he says. One box each; a long one runs
//                                on into the next box by itself.
//   Sit down! | Hello! | Hm?     " | " between ways of putting it: one is picked
//                                each time.
//   It is *very* haunted.        Stars round words light them up.
//   [wave] Hello hello.          In square brackets, at the start of a line:
//                                something he does as he says it (wave nod shake
//                                shrug laugh think) or a face for his visor
//                                (happy focus surprised sleepy wink neutral).
//   (He pokes the fire.)         In round brackets: something that happens, not
//                                something said.
//   > What is this place? -> place
//                                Something the visitor can say back, and the beat
//                                it leads to. "-> end" finishes; so does a reply
//                                with no arrow.
//   -> menu                      On a line of its own at the end of a beat: carry
//                                straight on to another beat.
//   // a note                    A line that starts with two slashes is ignored.
//
// A beat that has neither replies nor an arrow goes back to the last set of
// replies, so the usual shape is one beat of replies ("menu" below) and a short
// beat for each answer.
//
// Beats with names that mean something:
//   start, again       where conversations begin (see above)
//   hello              what he calls out when somebody walks up to him, or
//                      clicks him from the page: one line of it is picked
//   stars              (the Relay) where the conversation begins when the
//                      visitor is lying beside him
//   project            (the Overlook) what he says when somebody opens a
//                      project's page: one line of it is picked
//   project:the-slug   the same, for one project (the slug is the end of that
//                      page's address)
//
// The letters are the world's own pixel font: capitals, figures and plain
// punctuation. Anything else (an accent, an emoji) comes out as "?".
import overlook from './overlook';
import relay from './relay';
import switchback from './switchback';

/** By world: what Will says there. */
export const SCRIPTS: Record<string, string> = { overlook, relay, switchback };
