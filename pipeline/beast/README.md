The creature at the window (cabinet 3's leak): Eadweard Muybridge, *Animal Locomotion* (1887),
"A mastiff walking", Wellcome Collection b20133844, public domain
(https://wellcomecollection.org/works/pemntfyj). Twelve frames of the dog Dread in profile.

    curl -o src.jpg "https://iiif.wellcomecollection.org/image/B20133844.JP2/full/5000,/0/default.jpg"
    ffmpeg -i src.jpg -vf "crop=3800:1200:600:1150" -q:v 2 strip.jpg      # the two rows of frames
    node cut.mjs .                     # masks.json + cut-debug.png (each mask on its frame)
    node atlas.mjs . beast-rgba.png    # frames 2-7 (half a stride; frame 8 is frame 2 again)
    ffmpeg -i beast-rgba.png -pix_fmt gray ../../game/models/beast.png

The dog is light on a dark gridded backdrop: it is what no grid line runs near, together with
what is light against the darkest nearby; the ruler band at the feet keeps only what goes on
straight down from a leg; three glare patches are cleared by hand (`exclude`). Needs
puppeteer-core and Chrome (the image work runs on a canvas). The numbers the window's shader
needs (box, the dog's middle, the floor) are printed by atlas.mjs; see BEAST in game/js/room.js.
