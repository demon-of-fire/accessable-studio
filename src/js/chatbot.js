/**
 * Chatbot Module - Local command parser (no API keys needed)
 * Parses natural language commands to control the editor
 */

const Chatbot = (() => {
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');

  /** Add a message to the chat */
  function addMessage(text, isUser = false) {
    const msg = document.createElement('div');
    msg.className = `chat-message ${isUser ? 'user-message' : 'bot-message'}`;
    msg.setAttribute('role', 'article');
    msg.setAttribute('aria-label', `${isUser ? 'You' : 'Assistant'}: ${text.replace(/<[^>]*>/g, '')}`);
    msg.innerHTML = `<strong>${isUser ? 'You' : 'Assistant'}:</strong> ${text}`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /** Process a user command */
  function processCommand(input) {
    const text = input.trim().toLowerCase();
    if (!text) return;

    addMessage(input, true);

    // Parse and execute
    let response = '';

    // TRIM commands
    const trimFirstMatch = text.match(/trim\s+(?:the\s+)?first\s+(\d+(?:\.\d+)?)\s*(?:second|sec|s)/);
    const trimLastMatch = text.match(/trim\s+(?:the\s+)?last\s+(\d+(?:\.\d+)?)\s*(?:second|sec|s)/);

    if (trimFirstMatch) {
      const seconds = parseFloat(trimFirstMatch[1]);
      const clip = Timeline.getSelectedClip();
      if (clip) {
        Timeline.trimClip(clip.id, seconds, undefined);
        response = `Trimmed first ${seconds} seconds from "${clip.name}".`;
      } else {
        response = 'No clip selected. Click a clip on the timeline first, then try again.';
      }
    }
    else if (trimLastMatch) {
      const seconds = parseFloat(trimLastMatch[1]);
      const clip = Timeline.getSelectedClip();
      if (clip) {
        Timeline.trimClip(clip.id, undefined, seconds);
        response = `Trimmed last ${seconds} seconds from "${clip.name}".`;
      } else {
        response = 'No clip selected. Click a clip on the timeline first, then try again.';
      }
    }
    // SPLIT command
    else if (text.match(/split\s+(?:at\s+)?(\d+(?:\.\d+)?)\s*(?:second|sec|s)?/)) {
      const match = text.match(/split\s+(?:at\s+)?(\d+(?:\.\d+)?)\s*(?:second|sec|s)?/);
      const time = parseFloat(match[1]);
      const clip = Timeline.getSelectedClip() || Timeline.getClipsAtTime(time)[0];
      if (clip) {
        Timeline.splitClip(clip.id, time);
        response = `Split clip at ${time} seconds.`;
      } else {
        response = `No clip found at ${time} seconds.`;
      }
    }
    // DELETE clip
    else if (text.match(/delete|remove\s+clip/)) {
      const clip = Timeline.getSelectedClip();
      if (clip) {
        const name = clip.name;
        Timeline.removeClip(clip.id);
        response = `Deleted clip "${name}".`;
      } else {
        response = 'No clip selected to delete.';
      }
    }
    // DUPLICATE clip
    else if (text.match(/duplicate|copy\s+clip/)) {
      const clip = Timeline.getSelectedClip();
      if (clip) {
        Timeline.duplicateClip(clip.id);
        response = `Duplicated "${clip.name}".`;
      } else {
        response = 'No clip selected to duplicate.';
      }
    }
    // REMOVE AUDIO
    else if (text.match(/remove\s+audio|mute\s+clip|no\s+audio/)) {
      const clip = Timeline.getSelectedClip();
      if (clip) {
        Timeline.removeAudio(clip.id);
        response = `Removed audio from "${clip.name}".`;
      } else {
        response = 'No clip selected.';
      }
    }
    // SET VOLUME
    else if (text.match(/(?:set\s+)?volume\s+(?:to\s+)?(\d+)/)) {
      const match = text.match(/(?:set\s+)?volume\s+(?:to\s+)?(\d+)/);
      const vol = parseInt(match[1]);
      const clip = Timeline.getSelectedClip();
      if (clip) {
        Timeline.updateClipProperty(clip.id, 'volume', vol);
        response = `Set volume to ${vol}% for "${clip.name}".`;
      } else {
        response = 'No clip selected.';
      }
    }
    // SET SPEED
    else if (text.match(/(?:set\s+)?speed\s+(?:to\s+)?(\d+(?:\.\d+)?)/)) {
      const match = text.match(/(?:set\s+)?speed\s+(?:to\s+)?(\d+(?:\.\d+)?)/);
      const speed = parseFloat(match[1]);
      const clip = Timeline.getSelectedClip();
      if (clip) {
        Timeline.updateClipProperty(clip.id, 'speed', speed);
        response = `Set speed to ${speed}x for "${clip.name}".`;
      } else {
        response = 'No clip selected.';
      }
    }
    // SET FILTER VALUES
    else if (text.match(/(?:set\s+)?brightness\s+(?:to\s+)?(\d+)/)) {
      const val = parseInt(text.match(/(?:set\s+)?brightness\s+(?:to\s+)?(\d+)/)[1]);
      Effects.setFilter('brightness', val);
      response = `Brightness set to ${val}%.`;
    }
    else if (text.match(/(?:set\s+)?contrast\s+(?:to\s+)?(\d+)/)) {
      const val = parseInt(text.match(/(?:set\s+)?contrast\s+(?:to\s+)?(\d+)/)[1]);
      Effects.setFilter('contrast', val);
      response = `Contrast set to ${val}%.`;
    }
    else if (text.match(/(?:set\s+)?saturation\s+(?:to\s+)?(\d+)/)) {
      const val = parseInt(text.match(/(?:set\s+)?saturation\s+(?:to\s+)?(\d+)/)[1]);
      Effects.setFilter('saturation', val);
      response = `Saturation set to ${val}%.`;
    }
    // ADD BLUR
    else if (text.match(/(?:add\s+)?blur\s+(?:to\s+)?(\d+(?:\.\d+)?)/)) {
      const val = parseFloat(text.match(/(?:add\s+)?blur\s+(?:to\s+)?(\d+(?:\.\d+)?)/)[1]);
      Effects.setFilter('blur', val);
      response = `Blur set to ${val}px.`;
    }
    else if (text.match(/add\s+blur/)) {
      Effects.setFilter('blur', 3);
      response = 'Added blur effect (3px).';
    }
    // APPLY PRESET
    else if (text.match(/apply\s+(\w+)\s*(?:preset|filter)?/) || text.match(/(\w+)\s+(?:preset|filter)/)) {
      const match = text.match(/apply\s+(\w+)/) || text.match(/(\w+)\s+(?:preset|filter)/);
      const preset = match[1];
      if (Effects.applyPreset(preset)) {
        response = `Applied "${preset}" filter preset.`;
      } else {
        response = `Unknown preset "${preset}". Available: ${Effects.getPresetNames().join(', ')}`;
      }
    }
    // ADD TEXT
    else if (text.match(/add\s+text\s+(.*)/)) {
      const textContent = text.match(/add\s+text\s+(.*)/)[1];
      const playheadTime = Player.getCurrentTime();
      const trackEnd = Timeline.getTrackEndTime('text');
      const placeAt = (playheadTime > 0) ? playheadTime : trackEnd;
      Timeline.addClip({
        name: 'Text: ' + textContent.substring(0, 20),
        type: 'text',
        text: textContent,
        duration: 5,
        startTime: placeAt,
      });
      response = `Added text "${textContent}" at ${Accessibility.formatTime(placeAt)} for 5 seconds.`;
    }
    // LIST CLIPS
    else if (text.match(/what\s+clips|list\s+clips|show\s+clips|my\s+clips/)) {
      const clips = Timeline.getClips();
      if (clips.length === 0) {
        response = 'No clips on the timeline yet. Import some media to get started.';
      } else {
        let list = `You have ${clips.length} clip${clips.length > 1 ? 's' : ''} on the timeline:<ul>`;
        clips.forEach(c => {
          list += `<li><strong>${c.name}</strong> (${c.type}) - starts at ${Accessibility.formatTimeDisplay(c.startTime)}, duration ${Accessibility.formatTimeDisplay(c.duration)}</li>`;
        });
        list += '</ul>';
        response = list;
      }
    }
    // CLEAR TIMELINE
    else if (text.match(/clear\s+(?:the\s+)?timeline|remove\s+all/)) {
      Timeline.clearAll();
      response = 'Timeline cleared. All clips removed.';
    }
    // EXPORT
    else if (text.match(/export(?:\s+as)?\s+(\w+)/)) {
      const format = text.match(/export(?:\s+as)?\s+(\w+)/)[1];
      response = `To export as ${format}, use the Export Video button in the Video Editor toolbar, or press Ctrl+E.`;
      // Show export dialog
      const dialog = document.getElementById('export-dialog');
      const formatSelect = document.getElementById('export-format');
      if (formatSelect) {
        const option = Array.from(formatSelect.options).find(o => o.value === format);
        if (option) formatSelect.value = format;
      }
      if (dialog) Accessibility.showModal(dialog);
    }
    // HELP
    else if (text.match(/help|commands|what\s+can/)) {
      response = `Here are all the commands I understand:
        <ul>
          <li><strong>trim first/last [N] seconds</strong> - Remove from start/end</li>
          <li><strong>split at [N] seconds</strong> - Split clip</li>
          <li><strong>delete clip</strong> - Delete selected clip</li>
          <li><strong>duplicate clip</strong> - Copy selected clip</li>
          <li><strong>remove audio</strong> - Mute clip</li>
          <li><strong>set volume/speed/brightness/contrast/saturation to [N]</strong></li>
          <li><strong>add blur [N]</strong> - Add blur</li>
          <li><strong>apply [preset]</strong> - vintage, cinematic, noir, warm, cool, dramatic, faded, vivid</li>
          <li><strong>add text [your text]</strong> - Add text overlay</li>
          <li><strong>what clips do I have</strong> - List clips</li>
          <li><strong>clear timeline</strong> - Remove all clips</li>
          <li><strong>export as [format]</strong> - Export video</li>
        </ul>
        <strong>AI Features:</strong>
        <ul>
          <li><strong>search for [name] sound effect</strong> - Find free sound effects online</li>
          <li><strong>find background music for [mood]</strong> - Find free music tracks</li>
          <li><strong>auto color correct</strong> - Automatically fix video colors</li>
          <li><strong>auto enhance</strong> - Automatically improve photo quality</li>
          <li><strong>make it cinematic/dramatic/vintage/noir</strong> - Quick style changes</li>
          <li><strong>suggest edits</strong> - Get AI suggestions for your project</li>
          <li><strong>create montage</strong> - Auto-arrange clips into a montage</li>
          <li><strong>speed ramp</strong> - Add dramatic speed variation</li>
          <li><strong>close gaps</strong> - Remove empty space between clips</li>
          <li><strong>add fade in/out</strong> - Add fade effects</li>
          <li><strong>auto trim</strong> - Remove dead space from clip edges</li>
        </ul>`;
    }
    // Try AI Assistant for advanced commands
    else {
      const aiResponse = AIAssistant.processAICommand(text);
      if (aiResponse) {
        response = aiResponse;
      } else {
        response = `I didn't understand that command. Type <strong>help</strong> to see everything I can do, including AI features like searching for sounds and auto-editing.`;
      }
    }

    addMessage(response);
  }

  /** Init */
  function init() {
    const sendBtn = document.getElementById('btn-send-chat');

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          processCommand(chatInput.value);
          chatInput.value = '';
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        processCommand(chatInput.value);
        chatInput.value = '';
        chatInput.focus();
      });
    }
  }

  return { processCommand, init };
})();
