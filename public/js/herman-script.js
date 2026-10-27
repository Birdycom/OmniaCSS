// SCSS Document
// File: src/js/_colors.js
// Description: javascript to set the text for the colors page
// Copyright: 2021-2022 Birdycom
// Autor: Serge Cools
// Version: 0.2.0
// Framework: OmniaCSS
// Properties: background-color, color, colorname
// Values: rgb, rgba, hsl, hsla, #, name


const justifyContent = document.getElementById("justifyContent");
justifyContent.addEventListener("change", (evt) => {
  var element = document.getElementById("container");
  var className = document.getElementById("classname");
  element.classList.remove("justify-"+ className.textContent );
  className.textContent = evt.target.value;
  element.style.justifyContent = evt.target.value;
element.style.removeProperty
  element.classList.add("justify-" + evt.target.value);
});


/// <script>
///     const aligncontent = document.getElementById("aligncontent");
///     const display = document.getElementById("display");
///     const containeralign = document.getElementById("containeralign");
/// 
///     display.addEventListener("change", (evt) => {
///       const title = document.getElementById("title");
///       var classdisplay = document.getElementById("classdisplay");
///       if (evt.target.value == 'grid') {
///       containeralign.classList.remove(classdisplay.textContent, "wrap" );
///       containeralign.style.gridTemplateColumns = "";
///       containeralign.classList.add(evt.target.value );
///       containeralign.style.gridTemplateColumns = "repeat(2,56px)";
///         
///       } else {
/// 
///       containeralign.classList.remove(classdisplay.textContent );
///       containeralign.style.gridTemplateColumns = "";
///       containeralign.classList.add(evt.target.value, "wrap" );
///     
///       }
///       
///       title.textContent = evt.target.value ;
///       classdisplay.textContent = evt.target.value;
///   });
/// 
///     aligncontent.addEventListener("change", (evt) => {
///       var classname = document.getElementById("classname");
///       containeralign.classList.remove("place-" + classname.textContent );
///       classname.textContent = evt.target.value;
///       containeralign.classList.add("place-"+ evt.target.value );
///   });
///   </script>