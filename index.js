var blessed = require('blessed');

// Create a screen object.
var screen = blessed.screen({
    smartCSR: true,
    dockBorders : true
  });

screen.title = 'SysTerm - System Information';

// Create a box 
var box = blessed.box({
  top: '0%',
  left: '0%',
  width: '50%',
  height: '50%',
  content: 'Test',
  tags: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    bg: 'magenta',
    border: {
      fg: '#f0f0f0'
    },
    hover: {
      bg: 'cyan'
    }
  }
});

var table = blessed.table({
    top: '0%',
    left: '50%',
    width: '50%',
    height: '50%',

    data: [
        ['test', 'test', 'test'],
        ['test', 'test', 'test'],
        ['test', 'test', 'test']
    ],
    
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'magenta',
      border: {
        fg: '#f0f0f0'
      }
    }
  });

  var list = blessed.list({
    top: '50%',
    left: '0%',
    width: '50%',
    height: '50%',
    
    items: ['gnome','gnome','gnome','gnome','gnome'],

    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: '#f0f0f0'
      }
    }
  });

  var box4 = blessed.box({
    top: '50%',
    left: '50%',
    width: '50%',
    height: '50%',
    content: 'Test',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'magenta',
      border: {
        fg: '#f0f0f0'
      },
      hover: {
        bg: 'cyan'
      }
    }
  });


// Append our box to the screen.
screen.append(box);
screen.append(table);
screen.append(list);
screen.append(box4);


// If our box is clicked, change the content.
box.on('click', function(data) {
  box.setContent('{center}Some different {red-fg}content{/red-fg}.{/center}');
  screen.render();
});

// If box is focused, handle `enter`/`return` and give us some more content.
box.key('enter', function(ch, key) {
  box.setContent('{right}Even different {black-fg}content{/black-fg}.{/right}\n');
  box.setLine(1, 'bar');
  box.insertLine(1, 'foo');
  screen.render();
});

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});

// Focus our element.
box.focus();

// Render the screen.
screen.render();